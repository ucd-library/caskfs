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

  async getPoolClient() {
    if( !this.client.isPool ) {
      throw new Error('Database client is not a pool');
    }
    return new Database({
      client: await this.client.client.connect()
    });
  }

  release() {
    return this.client.release();
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
   * @param {Boolean} opts.simple if true, only return basic file table row not the full view
   * 
   * @returns {Promise} resolves to the file record, or null if not found
   */
  async getFile(opts={}) {
    let where = [];
    let params = [];

    let fileNameField = opts.simple ? 'name' : 'filename';
    let tableName = opts.simple ? `${this.schema}.file` : `${this.schema}.file_view`;

    if( opts.fileId ) {
      params.push(opts.fileId);
      where.push(`file_id = $${params.length}`);
    } else if( opts.filePath ) {
      let fileParts = path.parse(opts.filePath);
      params.push(fileParts.dir, fileParts.base);
      where.push(`directory_id = ${this.schema}.get_directory_id($${params.length - 1}) AND ${fileNameField} = $${params.length}`);
    } else {
      throw new Error('fileId, or filePath is required to get a file');
    }

    let resp = await this.client.query(`
      SELECT * FROM ${tableName} WHERE ${where.join(' AND ')}
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

  async updateFile(opts) {
    let {directoryId, filePath, hash, metadata={}, digests={}, size=0} = opts;

    let fileParts = path.parse(filePath);
    let resp = await this.client.query(`
      SELECT * FROM ${this.schema}.update_file(
        p_directory_id := $1::UUID,
        p_filename := $2::VARCHAR,
        p_hash_value := $3::VARCHAR,
        p_metadata := $4::JSONB,
        p_digests := $5::JSONB,
        p_size := $6::BIGINT,
        p_last_modified_by := $7::VARCHAR
      ) AS file_id
    `, [directoryId, fileParts.base, hash, metadata, digests, 
       size, opts.user]);

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
   * @description Get the child directories of a given directory. Assume access to root directory has already been verified.
   * Will perform ACL checks on child directories.
   *
   * @param {String} directory
   * @param {Object} opts
   * @param {Number} opts.limit limit number of results. Default 100
   * @param {Number} opts.offset offset for results. Default 0
   * @param {String} opts.requestor user making the request (for ACL checks)
   *
   * @returns {Promise<Array>} array of child directory objects
   */
  async getChildDirectories(directory, opts={}) {
    let userAclQuery = '';
    let aclOpts = {
      requestor: opts.requestor,
      dbClient : this
    };

    if( await acl.aclLookupRequired(aclOpts) ) {
      userAclQuery = '(acl_lookup.user_id IS NULL AND acl_lookup.can_read = TRUE)';
      if( opts.requestor ) {
        let userId = await acl.getUserId({ user: opts.requestor, dbClient: this });
        if( userId !== null && userId !== undefined ) {
          userAclQuery = `OR (acl_lookup.user_id = ${userId} AND acl_lookup.can_read = TRUE)`;
        }
      }
      userAclQuery = ' AND (' + userAclQuery + ')';
    }

    let params = [directory, opts.limit || 100, opts.offset || 0];

    let fileNameQuery = '';
    if( opts.query ) {
      fileNameQuery = `AND name ILIKE '%' || $4 || '%'`;
      params.push(opts.query);
    }

    const sql = `
      SELECT 
        d.directory_id,
        d.fullname,
        d.name,
        d.parent_id,
        d.created,
        d.modified,
        COUNT(*) OVER() as total_count
      FROM ${config.database.schema}.directory d
      LEFT JOIN ${config.database.schema}.directory_user_permissions_lookup acl_lookup ON acl_lookup.directory_id = d.directory_id
      WHERE parent_id = ${config.database.schema}.get_directory_id($1)
        ${userAclQuery}
        ${fileNameQuery}
      ORDER BY fullname ASC
      LIMIT $2 OFFSET $3;
    `;
    let res = await this.client.query(sql, params);

    let totalCount = res.rows.length > 0 ? parseInt(res.rows[0].total_count) : 0;
    res.rows = res.rows.map(r => { delete r.total_count; return r; });

    return { 
      totalCount: totalCount, 
      results: res.rows, 
      offset: parseInt(opts.offset) || 0, 
      limit: parseInt(opts.limit) || 100
    };
  }

  /**
   * @method getChildFiles
   * @description Get the child files of a given directory. Assumes access checks have already been done.
   * 
   * @param {String} directory 
   * @param {Object} opts
   * @param {Number} opts.limit limit number of results. Default 100
   * @param {Number} opts.offset offset for results. Default 0 
   * @param {String} opts.query text to filter file names
   * @returns 
   */
  async getChildFiles(directory, opts={}) {
    let params = [directory, opts.limit || 100, opts.offset || 0];

    let fileNameQuery = '';
    if( opts.query ) {
      fileNameQuery = `AND filename ILIKE '%' || $4 || '%'`;
      params.push(opts.query);
    }

    const sql = `
      SELECT 
        *,
        COUNT(*) OVER() as total_count 
      FROM ${this.schema}.file_view 
      WHERE directory_id = ${config.database.schema}.get_directory_id($1) 
            ${fileNameQuery}
      ORDER BY directory, filename ASC 
      LIMIT $2 OFFSET $3;
    `;
    let res = await this.client.query(sql, params);

    return { 
      totalCount: res.rows.length > 0 ? parseInt(res.rows[0].total_count) : 0,
      results: res.rows.map(r => { delete r.total_count; return r; }),
      offset: parseInt(opts.offset) || 0,
      limit: parseInt(opts.limit) || 100
    };
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
    let args = [];

    let withClauses = this.generateFileWithFilter(opts, args);

    let {table, aclQuery} = await this.generateAclWithFilter(opts, args);
    if( aclQuery ) withClauses = withClauses + ', ' + aclQuery;

    // order here matter for the limit/offset parameters below
    if( !opts.limit ) opts.limit = 100;
    if( !opts.offset ) opts.offset = 0;
    args.push(opts.limit);
    args.push(opts.offset);

    let query = `
      WITH ${withClauses},
      total AS (
        SELECT COUNT(*) AS total_count
        FROM ${table}
      )
      SELECT
        fv.file_id,
        fv.filepath,
        fv.metadata,
        fv.created,
        fv.modified,
        fv.last_modified_by,
        total.total_count
      FROM total, ${table} f
      JOIN ${config.database.schema}.simple_file_view fv ON fv.file_id = f.file_id
      ORDER BY fv.filepath ASC
      LIMIT $${args.length - 1} OFFSET $${args.length}
    `;

    if( opts.debugQuery ) {
      return { query, args };
    }

    let resp = await this.client.query(query, args);
    let totalCount = resp.rows.length > 0 ? parseInt(resp.rows[0].total_count) : 0;
    resp.rows = resp.rows.map(r => { delete r.total_count; return r; });

    return { totalCount, results: resp.rows, offset: opts.offset, limit: opts.limit};
  }

  /**
   * @method generateAclWithFilter
   * @description Generate SQL WITH clauses to filter files based on ACLs.  Assumes you
   * have a files table and will return an acl_files table if ACL filtering is required.
   * If no ACL filtering is required, it will return the original files table.
   * 
   * @param {*} opts 
   * @param {*} args 
   * @returns 
   */
  async generateAclWithFilter(opts={}, args) {
    let aclOpts = {
      requestor: opts.requestor,
      ignoreAcl : opts.ignoreAcl,
      dbClient : opts.dbClient || this
    };

    let table = 'files';
    let aclQuery = '';
    if( await acl.aclLookupRequired(aclOpts) ) {
      let aclWhere = [
        '(acl_lookup.user_id IS NULL AND acl_lookup.can_read = TRUE)'
      ];

      if( opts.requestor && !opts.userId ) {
        opts.userId = await acl.getUserId({ user: opts.requestor, dbClient: aclOpts.dbClient });
      }

      if( opts.userId !== null && opts.userId !== undefined ) {
        aclWhere.push(`(acl_lookup.user_id = $${args.length + 1} AND acl_lookup.can_read = TRUE)`);
        args.push(opts.userId);
      }

      aclQuery = `
      acl_files AS (
        SELECT DISTINCT f.file_id
        FROM files fs
        LEFT JOIN ${config.database.schema}.file f ON f.file_id = fs.file_id
        LEFT JOIN ${config.database.schema}.directory_user_permissions_lookup acl_lookup ON acl_lookup.directory_id = f.directory_id
        WHERE ${aclWhere.join(' OR ')}
      )`;
      table = 'acl_files';
    }

    return { aclQuery, table };
  }

  /**
   * @method generateFileWithFilter
   * @description Generate SQL WITH clauses to filter files based on linked data filters. Options
   * include object, subject, predicate, graph, type, and partitionKeys.  All specified filters
   * will be ANDed together.  You will have a final WITH clause named "files" that contains the filtered file IDs.
   *
   * @param {Object} opts
   * @param {String} opts.object object URI to filter by
   * @param {String} opts.subject subject URI to filter by
   * @param {String} opts.predicate predicate URI to filter by
   * @param {String} opts.graph graph URI to filter by
   * @param {String} opts.type type URI to filter by
   * @param {Array} opts.partitionKeys array of partition keys to filter by
   * @returns {String} SQL WITH clauses for filtering files
   */
  generateFileWithFilter(opts={}, args) {
    let withClauses = opts.withClauses || [];
    let intersectClauses = opts.intersectClauses || [];
    let basic = ['object', 'subject', 'predicate', 'graph', 'type'];

    for( let type of basic ) {
      if( !opts[type] ) continue;

      withClauses.push(`${type}_match AS (
        SELECT ld_filter_id FROM ${config.database.schema}.ld_filter
        WHERE type = '${type}' AND uri_id = caskfs.get_uri_id($${args.length + 1})
      ),
      ${type}_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_filter f
        JOIN ${type}_match tm ON tm.ld_filter_id = f.ld_filter_id
      )
      `);
      intersectClauses.push(`SELECT file_id FROM ${type}_file_match`);
      args.push(opts[type]);
    }

    // we want all the ld_link that have an object equal to the subject 
    if( opts.target && opts.target.fileId ) {
      let predicateFilter = '';
      if( opts.target.predicate ) {
        predicateFilter = ` AND predicate_uri_id = ANY(SELECT subject_uris FROM target_subjects)`;
        args.push(opts.target.predicate);
      }

      withClauses.push(`
      target_subjects AS (
        SELECT 
          ARRAY_AGG(uri_id) AS subject_uris
        FROM ${config.database.schema}.file_ld_filter
        WHERE file_id = $${args.length + 1} AND type = 'subject'
        GROUP BY file_id
      ),
      target_subject_match AS (
        SELECT ld_link_id FROM ${config.database.schema}.ld_link
        WHERE object = caskfs.get_uri_id($${args.length + 1}) 
              ${predicateFilter}
      ),
      target_subject_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_link f
        JOIN target_subject_match tsm ON tsm.ld_link_id = f.ld_link_id
        WHERE f.file_id != $${args.length + 2}
      )  
      `);
      intersectClauses.push(`SELECT file_id FROM target_subject_file_match`);
      args.push(opts.target.subject);
      args.push(opts.target.fileId);
    }

    let cteFileName = opts.partitionKeys ? `filtered_matches` : `files`;

    if( intersectClauses.length > 0 ) {
      withClauses.push(`${cteFileName} AS (
        ${intersectClauses.join('\nINTERSECT\n')}
      )`);
    } else {
      withClauses.push(`${cteFileName} AS (
        SELECT file_id FROM ${config.database.schema}.file
      )`);
    }

    if( !opts.partitionKeys ) {
      return withClauses.join(', ');
    }

    if( !Array.isArray(opts.partitionKeys) ) {
      opts.partitionKeys = [opts.partitionKeys];
    }
    let joinClauses = [`SELECT f0.file_id
      FROM ${cteFileName} fm
      JOIN ${config.database.schema}.file_partition_key f0
        ON f0.file_id = fm.file_id
      JOIN ${config.database.schema}.partition_key pk0 
        ON f0.partition_key_id = pk0.partition_key_id
        AND pk0.value = $${args.length + 1}`];
    args.push(opts.partitionKeys[0]);

    for( let i = 1; i < opts.partitionKeys.length; i++ ) {
      joinClauses.push(`JOIN ${config.database.schema}.file_partition_key f${i}
          ON f${i}.file_id = f0.file_id
        JOIN ${config.database.schema}.partition_key pk${i} 
          ON f${i}.partition_key_id = pk${i}.partition_key_id
          AND pk${i}.value = $${args.length + 1}`);
      args.push(opts.partitionKeys[i]);
    }

    withClauses.push(`partition_file_match AS (
      ${joinClauses.join('\n')}
    )`);
    withClauses.push(`files AS (
      SELECT file_id FROM partition_file_match
    )`);

    return withClauses.join(', ');
  }

  async getLiteralValues(opts={}) {
    if( !opts.subject ) {
      throw new Error('subject is required to get literal values');
    }

    let withClauses = [];
    let args = [];

    let offset = opts.offset || 0;
    let limit = opts.limit || 5;

    let where = [];
    ['subject', 'predicate', 'graph'].forEach(field => {
      if( opts[field] ) {
        where.push(`${field} = caskfs.get_uri_id($${args.length + 1})`);
        args.push(opts[field]);
      }
    });

    let fileFilter = 'f.ld_literal_id IN (SELECT ld_literal_id FROM subject_match)';
    if( opts.filePath ) {
      let fileId = await this.getFile({ filePath: opts.filePath });
      if( !fileId ) throw new MissingResourceError('File', opts.filePath);
      fileFilter = `f.file_id = $${args.length + 1}`;
      args.push(fileId.file_id);
    }

    withClauses.push(`subject_match AS (
      SELECT ld_literal_id FROM ${config.database.schema}.ld_literal
      WHERE ${where.join(' AND ')}
    ),
    files AS (
      SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_literal f
      WHERE ${fileFilter}
    )
    `);

    let {table, aclQuery} = await this.generateAclWithFilter(opts, args);
    if( aclQuery ) withClauses.push(aclQuery);

    args.push(limit);
    args.push(offset);

    let query = `
      WITH ${withClauses.join(', ')}
      SELECT
        gu.uri AS graph,
        su.uri AS subject,
        pu.uri AS predicate,
        ll.value AS object,
        ll.language AS language,
        ll.datatype AS datatype
      FROM ${table} f
      LEFT JOIN ${config.database.schema}.file_ld_literal fll ON fll.file_id = f.file_id
      LEFT JOIN caskfs.ld_literal ll ON fll.ld_literal_id = ll.ld_literal_id
      LEFT JOIN caskfs.uri pu ON ll.predicate = pu.uri_id
      LEFT JOIN caskfs.uri su ON ll.subject = su.uri_id
      LEFT JOIN caskfs.uri gu ON ll.graph = gu.uri_id
      WHERE fll.ld_literal_id IN (SELECT ld_literal_id FROM subject_match)
      LIMIT $${args.length - 1} OFFSET $${args.length}
    `;

    if( opts.debugQuery ) {
      return { query, args };
    }

    let resp = await this.client.query(query, args);
    return {
      limit,
      offset,
      results: resp.rows,
    }
  }

  powerWash() {
    return this.client.query(`DROP SCHEMA IF EXISTS ${this.schema} CASCADE;`);
  }

}

export default Database;
