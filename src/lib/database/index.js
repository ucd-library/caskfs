import path from 'path';
import PgClient from "./pg-client.js";
import SqliteClient from "./sqlite-client.js";
import config from '../config.js';
import acl from '../acl.js';
import { getLogger } from '../logger.js';
import { MissingResourceError } from '../errors.js';


class Database {

  constructor(opts={}) {
    this.client = opts.client;
    this.logger = getLogger('database');

    this.schema = opts.schema || config.database.schema || 'caskfs';

    if( this.client ) {
      this.logger.debug('Using provided database client');
      return;
    }

    if( !opts.type && config.database.type ) {
      opts.type = config.database.type;
    }

    if( !this.client && opts.type ) {
      if( opts.type === 'sqlite' ) {
        this.logger.debug('Creating new SQLite database client');
        this.client = new SqliteClient(opts);
      } else if( (opts.type === 'pg') ) {
        this.logger.debug('Creating new Postgres database client');
        this.client = new PgClient(opts);
      } else {
        throw new Error(`Unsupported database type: ${opts.type}`);
      }
    }

    if( !this.client ) {
      throw new Error('No database client specified');
    }
  }

  connect() {
    return this.client.connect();
  }

  init() {
    return this.client.init();
  }

  queryFromFile(filePath) {
    return this.client.queryFromFile(filePath);
  }

  query(sql, params) {
    return this.client.query(sql, params);
  }

  end() {
    return this.client.end();
  }

  /**
   * @method fileExists
   * @description Check if a file exists in the CASKFS.
   *
   * @param {String} filePath file path to check
   *
   * @returns {Boolean} true if the file exists, false otherwise
   */
  async fileExists(filePath) {
    let fileParts = path.parse(filePath);
    let res = await this.client.query(`
      SELECT 1 FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);

    return res.rows.length > 0;
  }

  async pathExists(filePath) {
    let fileParts = path.parse(filePath);
    let res = await this.client.query(`
      SELECT 1 FROM ${this.schema}.directory WHERE fullname = $1
      UNION
      SELECT 1 FROM ${this.schema}.file_view WHERE directory = $2 AND filename = $3
    `, [filePath, fileParts.dir, fileParts.base]);

    return res.rows.length > 0;
  }

  /**
   * @method getFile
   * @description Get a file record from the database by file ID or file path.
   *
   * @param {Object} opts
   * @param {String} opts.fileId file ID to look up
   * @param {String} opts.filePath file path to look up
   *
   * @returns {Promise} resolves to the file record, or null if not found
   */
  async getFile(opts={}) {
    let where = [];
    let params = [];

    if( opts.fileId ) {
      params.push(opts.fileId);
      where.push(`file_id = $${params.length}`);
    } else if( opts.filePath ) {
      let fileParts = path.parse(opts.filePath);
      params.push(fileParts.dir, fileParts.base);
      where.push(`directory = $${params.length - 1} AND filename = $${params.length}`);
    } else {
      throw new Error('fileId, or filePath is required to get a file');
    }

    let resp = await this.client.query(`
      SELECT * FROM ${this.schema}.file_view WHERE ${where.join(' AND ')}
    `, params);
    return resp.rows[0] || null;
  }

  async getFileBucket(hashFilePath) {
    let hash = path.parse(hashFilePath).name;
    let resp = await this.client.query(`
      SELECT bucket FROM ${this.schema}.hash WHERE value = $1
    `, [hash]);

    if( resp.rows.length === 0 ) {
      throw new Error(`File not found: ${hashFilePath}`);
    }

    return resp.rows[0].bucket || null;
  }

  /**
   * @method getFiles
   * @description Get all files with the given hash value.
   *
   * @param {String} hash hash value to look up
   *
   * @returns {Promise<Array>} array of file records with the given hash
   */
  async getFiles(hash) {
    let resp = await this.client.query(`
      SELECT * FROM ${this.schema}.file_view WHERE hash_value = $1
    `, [hash]);
    return resp.rows || [];
  }

  async insertFile(opts) {
    let {directoryId, filePath, hash, metadata={}, digests={}, size=0, bucket} = opts;

    let fileParts = path.parse(filePath);
    let resp = await this.client.query(`
      SELECT * FROM ${this.schema}.insert_file(
        p_directory_id := $1::UUID,
        p_filename := $2::VARCHAR,
        p_hash_value := $3::VARCHAR,
        p_metadata := $4::JSONB,
        p_digests := $5::JSONB,
        p_size := $6::BIGINT,
        p_bucket := $7::VARCHAR,
        p_last_modified_by := $8::VARCHAR
      ) AS file_id
    `, [directoryId, fileParts.base, hash, metadata, digests, 
       size, bucket, opts.user]);

    return resp.rows[0].file_id;
  }

  /**
   * @method addPartitionKeyToFile
   * @description Add a partition key to a file.  This will create the partition key
   * if it does not already exist.
   * 
   * @param {String} fileId 
   * @param {String} partitionKey 
   * @param {String} autoPathPartitionName 
   */
  async addPartitionKeyToFile(fileId, partitionKey, autoPathPartitionName) {
    await this.client.query(`
      select ${this.schema}.add_partition_key($1::UUID, $2::VARCHAR, $3::VARCHAR)
    `, [fileId, partitionKey, autoPathPartitionName]);
  }

  async clearFilePartitionKeys(fileId) {
    await this.client.query(`
      DELETE FROM ${this.schema}.file_partition_key WHERE file_id = $1
    `, [fileId]);
  }

  /**
   * @method updateFileMetadata
   * @description Update the metadata and/or partition keys for a file.
   *
   * @param {String} filePath file path to update
   * @param {Object} opts
   * @param {Object} opts.metadata metadata object to set
   *
   * @returns {Promise}
   */
  async updateFileMetadata(filePath, opts={}) {
    let fileParts = path.parse(filePath);
    if( opts.metadata ) {
      await this.client.query(`
        with directory as (
          select directory_id from ${this.schema}.directory where fullname = $2
        )
        UPDATE ${this.schema}.file SET metadata = $1::JSONB WHERE directory_id = (select directory_id from directory) AND name = $3
        RETURNING *
      `, [opts.metadata, fileParts.dir, fileParts.base]);
    }
  }

  /**
   * @method getDirectory
   * @description Get a directory object from the database.
   *
   * @param {String} directory directory path to get
   *
   * @returns {Object} directory object
   */
  async getDirectory(directory) {
    let res = await this.client.query(
      `SELECT * FROM ${this.schema}.directory WHERE fullname = $1`,
      [directory]
    );
    if (res.rows.length === 0) {
      throw new MissingResourceError("Directory", directory);
    }
    return res.rows[0];
  }

  /**
   * @method getChildDirectories
   * @description Get the child directories of a given directory.
   *
   * @param {String} directory
   * @param {Object} opts
   * @param {Number} opts.limit limit number of results. Default 100
   * @param {Number} opts.offset offset for results. Default 0
   *
   * @returns {Promise<Array>} array of child directory objects
   */
  async getChildDirectories(directory, opts={}) {
    if( opts.ignoreAcl ) {
      this.logger.warn('Ignoring ACL checks. This should only be done for admin users.');
    }

    const sql = `
      with dir as (
        select directory_id from ${config.database.schema}.directory where fullname = $1
      )
      SELECT * FROM ${config.database.schema}.directory
      WHERE parent_id = (select directory_id from dir)
      ORDER BY fullname ASC
      LIMIT $2 OFFSET $3;
    `;
    let res = await this.client.query(sql, [directory, opts.limit || 100, opts.offset || 0]);

    return res.rows;
  }

  /**
   * @method findFiles
   * @description Find files that match the given criteria.
   *
   * @param {Object} opts
   * @param {String|Array} opts.partition partition key or array of partition keys to match
   * @param {String} opts.graph graph URI to match
   * @param {String} opts.predicate predicate URI to match
   * @param {String} opts.subject subject URI to match
   * @param {String} opts.object object URI to match
   * @param {Number} opts.limit limit number of results. Default 100
   * @param {Number} opts.offset offset for results. Default 0
   *
   * @returns {Promise<Array>} array of matching file URIs
   */
  async findFiles(opts={}) {
    let linkWhere = [];
    let nodeWhere = [];
    let args = [];

    let aclOpts = {
      user: opts.user,
      ignoreAcl : opts.ignoreAcl,
      dbClient : opts.dbClient || this
    };
    
    let aclJoin = '';
    if( await acl.aclLookupRequired(aclOpts) ) {
      aclJoin = `
      LEFT JOIN ${config.database.schema}.file f ON f.file_id = rdf.file_id
      LEFT JOIN ${config.database.schema}.directory_user_permissions_lookup acl_lookup ON acl_lookup.directory_id = f.directory_id`;
      
      let aclWhere = [
        '(acl_lookup.user_id IS NULL AND acl_lookup.can_read = TRUE)'
      ];

      if( opts.userId !== null && opts.userId !== undefined ) {
        aclWhere.push(`(acl_lookup.user_id = $${args.length + 1} AND acl_lookup.can_read = TRUE)`);
        args.push(opts.userId);
      }

      linkWhere.push(`(${aclWhere.join(' OR ')})`);
      nodeWhere.push(`(${aclWhere.join(' OR ')})`);
    }

    // if( opts.partitionKeys ) {
    //   if( !Array.isArray(opts.partitionKeys) ) {
    //     opts.partitionKeys = [opts.partitionKeys];
    //   }
    //   linkWhere.push(`rdf.partition_keys @> $${args.length + 1}::VARCHAR(256)[]`);
    //   args.push(opts.partitionKeys);
    // }


    let withClauses = [];
    let intersectClauses = [];
    if( opts.graph  ) {
      withClauses.push(`graph_match AS (
        SELECT ld_filter_id FROM ${config.database.schema}.ld_filter
        WHERE type = 'graph' AND uri_id = caskfs.get_uri_id($${args.length + 1})
      ),
      graph_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_filter f
        JOIN graph_match gm ON gm.ld_filter_id = f.ld_filter_id
      )
      `);
      intersectClauses.push(`SELECT file_id FROM graph_file_match`);
      args.push(opts.graph);
    }

    if( opts.subject ) {
      withClauses.push(`subject_match AS (
        SELECT ld_filter_id FROM ${config.database.schema}.ld_filter
        WHERE type = 'subject' AND uri_id = caskfs.get_uri_id($${args.length + 1})
      ),
      subject_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_filter f
        JOIN subject_match sm ON sm.ld_filter_id = f.ld_filter_id
      )
      `);
      intersectClauses.push(`SELECT file_id FROM subject_file_match`);
      args.push(opts.subject);
    }

    if( opts.predicate ) {
      withClauses.push(`predicate_match AS (
        SELECT ld_filter_id FROM ${config.database.schema}.ld_filter
        WHERE type = 'predicate' AND uri_id = caskfs.get_uri_id($${args.length + 1})
      ),
      predicate_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_filter f
        JOIN predicate_match pm ON pm.ld_filter_id = f.ld_filter_id
      )
      `);
      intersectClauses.push(`SELECT file_id FROM predicate_file_match`);
      args.push(opts.predicate);
    }

    if( opts.object ) {
      withClauses.push(`object_match AS (
        SELECT ld_filter_id FROM ${config.database.schema}.ld_filter
        WHERE type = 'object' AND uri_id = caskfs.get_uri_id($${args.length + 1})
      ),
      object_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_filter f
        JOIN object_match om ON om.ld_filter_id = f.ld_filter_id
      )
      `);
      intersectClauses.push(`SELECT file_id FROM object_file_match`);
      args.push(opts.object);
    }

    if( opts.partitionKeys ) {
      withClauses.push(`partition_match AS (
        SELECT partition_key_id FROM ${config.database.schema}.partition_key pk
        WHERE pk.value = ANY($${args.length + 1}::VARCHAR(256)[])
      ),
      partition_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_partition_key f
        JOIN partition_match pm ON pm.partition_key_id = f.partition_key_id
      )  
      `);
      intersectClauses.push(`SELECT file_id FROM partition_file_match`);
      args.push(opts.partitionKeys);
    }
 
    if( intersectClauses.length > 0 ) {
      withClauses.push(`files AS (
        ${intersectClauses.join('\nINTERSECT\n')}
      )`);
    } else {
      withClauses.push(`files AS (
        SELECT file_id FROM ${config.database.schema}.file
      )`);
    }

    // order here matter for the limit/offset parameters below
    args.push(opts.limit || 100);
    args.push(opts.offset || 0);


    let query = `
      WITH ${withClauses.join(', ')}
      SELECT
        fv.*
      FROM files f
      JOIN ${config.database.schema}.simple_file_view fv ON fv.file_id = f.file_id
      ORDER BY fv.filepath ASC
      LIMIT $${args.length - 1} OFFSET $${args.length}
    `;

    if( opts.debugQuery ) {
      return { query, args };
    }

    let resp = await this.client.query(query, args);
    return resp.rows;
  }

  // /**
  //  * @method findRdfNodes
  //  * @description Internal method to query RDF data from the database based on given options.  A subject or
  //  * a file must be specified. Will return jsonld dataset of nodes and links that match the query.
  //  * Will limit to 10,000 nodes AND 10,000 links.
  //  *
  //  * @param {Object} opts query options
  //  * @param {String} opts.file file path to filter by
  //  * @param {String} opts.subject subject URI to filter by
  //  * @param {String} opts.graph graph URI to filter by (must be used with subject or file)
  //  * @param {String|Array} opts.partition partition key or array of partition keys to filter by
  //  * @param {Number} opts.limit limit number of results. Default 10000 nodes and 10000 links
  //  *
  //  * @returns {Promise<Object>} JSON-LD dataset of nodes and links that match the query
  //  */
  // async findRdfNodes(opts={}) {
  //   let where = [];
  //   let args = [];

  //   if( !opts.file && !opts.subject && !opts.object ) {
  //     throw new Error('File, subject, or object must be specified for rdf queries');
  //   }

  //   let aclOpts = {
  //     requestor: opts.requestor,
  //     ignoreAcl : opts.ignoreAcl,
  //     dbClient : opts.dbClient || this
  //   };

  //   let aclJoin = '';
  //   if( await acl.aclLookupRequired(aclOpts) ) {
  //     aclJoin = `LEFT JOIN ${config.database.schema}.directory_user_permissions_lookup acl_lookup ON acl_lookup.directory_id = rdf.directory_id`;
      
  //     let aclWhere = [
  //       '(acl_lookup.user_id IS NULL AND acl_lookup.can_read = TRUE)'
  //     ];

  //     if( !opts.userId && opts.requestor ) {
  //       opts.userId = await acl.getUserId({user: opts.requestor, dbClient: aclOpts.dbClient});
  //     }

  //     if( opts.userId !== null ) {
  //       aclWhere.push(`(acl_lookup.user_id = $${args.length + 1} AND acl_lookup.can_read = TRUE)`);
  //       args.push(opts.userId);
  //     }

  //     where.push(`(${aclWhere.join(' OR ')})`);
  //   }

  //   if( opts.partition ) {
  //     if( !Array.isArray(opts.partition) ) {
  //       opts.partition = [opts.partition];
  //     }
  //     where.push(`partition_keys @> $${args.length + 1}::VARCHAR(256)[]`);
  //     args.push(opts.partition);
  //   }
  //   if( opts.graph ) {
  //     where.push(`graph = $${args.length + 1}`);
  //     args.push(opts.graph);
  //   }
  //   if( opts.object ) {
  //     where.push(`object = $${args.length + 1}`);
  //     args.push(opts.object);
  //   }
  //   if( opts.subject ) {
  //     where.push(`subject = $${args.length + 1}`);
  //     args.push(opts.subject);
  //   }
  //   if( opts.file ) {
  //     where.push(`filepath = $${args.length + 1}`);
  //     args.push(opts.file);
  //   }

  //   let limit = 'LIMIT $'+(args.length + 1);
  //   args.push(opts.limit || 10000);

  //   let nodes = [];
  //   if( !opts.object ) {
  //     nodes = await this.client.query(`
  //       SELECT * FROM ${config.database.schema}.rdf_node_view rdf
  //       ${aclJoin}
  //       WHERE ${where.join(' AND ')} ${limit}
  //     `, args);
  //     nodes = nodes.rows;
  //   }

  //   let links = await this.client.query(`
  //     SELECT * FROM ${config.database.schema}.rdf_link_view rdf
  //     ${aclJoin}
  //     WHERE ${where.join(' AND ')} ${limit}
  //   `, args);
  //   links = links.rows;

  //   let dataset = {};
  //   let context = {};
  //   for( let n of nodes ) {
  //     if( !dataset[n.graph] ) {
  //       dataset[n.graph] = {
  //         '@id': n.graph,
  //         '@graph': {}
  //       }
  //     }
  //     dataset[n.graph]['@graph'][n.subject] = n.data;
  //     context = Object.assign(context, n.context);
  //   }

  //   for( let l of links ) {
  //     if( !dataset[l.graph] ) {
  //       dataset[l.graph] = {
  //         '@id': l.graph,
  //         '@graph': {}
  //       };
  //     }
  //     if( !dataset[l.graph]['@graph'][l.subject] ) {
  //       dataset[l.graph]['@graph'][l.subject] = { '@id': l.subject };
  //     }
  //     dataset[l.graph]['@graph'][l.subject][l.predicate] = { '@id': l.object };
  //   }

  //   // convert graph objects to arrays
  //   for( let g of Object.keys(dataset) ) {
  //     dataset[g]['@graph'] = Object.values(dataset[g]['@graph']);
  //   }

  //   let data = {
  //     '@context': context,
  //     '@graph': []
  //   };

  //   for( let g of Object.keys(dataset) ) {
  //     data['@graph'].push(dataset[g]);
  //   }

  //   return data;
  // }

  powerWash() {
    return this.client.query(`DROP SCHEMA IF EXISTS ${this.schema} CASCADE;`);
  }

}

export default Database;
