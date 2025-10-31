import { Parser as QuadsParser, Writer as QuadsWriter, DataFactory } from "n3";
import jsonld from "jsonld";
import Database from "./database/index.js";
import config from "./config.js";
import path from "path";
import fsp from "fs/promises";
import { getLogger } from './logger.js';
import acl from './acl.js';
const { namedNode } = DataFactory;

const customLoader = async (url, options) => {
  url = new URL(url);
  return {
    contextUrl: null, // this is for a context via a link header
    document: {
      '@context': {
        '@vocab': url.origin+'/',
        '@base': url.origin+'/'
      }
    }, // this is the actual document that was loaded
    documentUrl: url // this is the actual context URL after redirects
  };
};

class Rdf {
  constructor(opts={}) {
    this.dbClient = opts.dbClient || new Database({type: opts.dbType});
    this.cas = opts.cas;
    this.quadsParser = new QuadsParser();

    this.logger = getLogger('rdf');

    this.jsonldExt = '.jsonld.json';
    this.jsonLdMimeType = 'application/ld+json';
    this.nquadsMimeType = 'application/n-quads';
    this.n3MimeType = 'text/n3';
    this.turtleMimeType = 'text/turtle';

    this.TYPE_PREDICATE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  }

  /**
   * @method read
   * @description Read RDF data from the CASKFS and return in the specified format.  A file or subject
   * must be specified.  Will return a JSON-LD dataset by default, or can return in other RDF formats.
   *
   * @param {Object} opts
   * @param {String} opts.file file path to filter by
   * @param {String} opts.format RDF format to return: jsonld (default), compact, cask, flattened, expanded, nquads, json
   * 
   * @returns {Promise<Object>} RDF data in the specified format
   */
  async read(opts={}) {
    let format = opts.format;
    let filePath = opts.filePath;
    let dbClient = opts.dbClient || this.dbClient;

    if( !filePath ) {
      throw new Error('File path is required to read Linked Data');
    }

    let parts = path.parse(filePath);

    let data = await dbClient.query(
      `SELECT file_nquads, cask_nquads FROM ${config.database.schema}.file_quads_view WHERE filename = $1 AND directory = $2`, 
      [parts.base, parts.dir]
    );
    if( data.rows.length === 0 ) {
      throw new Error(`No RDF data found for file: ${filePath}`);
    }

    let nquads = [];
    if( data.rows[0].file_nquads ) nquads.push(data.rows[0].file_nquads);
    if( data.rows[0].cask_nquads ) nquads.push(data.rows[0].cask_nquads);

    // not get all of the quads for this subject
    // TODO: do we only do this for all file types?? or do we just do it for binary files?
    let subject = config.schemaPrefix+filePath;
    console.log('Looking for linked files for subject', subject);

    // TODO: add flag for limiting to same partition keys as the file
    let linkedFiles = await this.find({ subject, dbClient });

    let linkedFileQuads;
    if( linkedFiles.totalCount > 0 ) {
      for( let lf of linkedFiles.results ) {
        if( lf.filepath === filePath ) continue;

        linkedFileQuads = await dbClient.query(
          `SELECT file_nquads FROM ${config.database.schema}.file_quads_view WHERE filename = $1 AND directory = $2`, 
          [lf.filename, lf.directory]
        );

        if( !linkedFileQuads.rows.length ) continue;
        linkedFileQuads = linkedFileQuads.rows[0].file_nquads;
        linkedFileQuads = this.quadsParser.parse(linkedFileQuads)
          .filter(q => q.subject.value === subject);
        nquads.push(await this._objectToNQuads(linkedFileQuads));
      }
    }

    data = nquads.join('\n');

    if( format === 'nquads' || format === 'application/n-quads' ) {
      // return jsonld.canonize(data, {
      //   algorithm: 'URDNA2015',
      //   format: 'application/n-quads'
      // });
      return nquads;
    }

    if( format === 'json' || format === 'application/json' ) {
      // const nquads = await jsonld.canonize(data, {
      //   algorithm: 'URDNA2015',
      //   format: 'application/n-quads'
      // });

      return this.quadsParser.parse(nquads)
        .map(q => ({
          graph: q.graph.value || null,
          subject: q.subject.value,
          predicate: q.predicate.value,
          object: q.object.toJSON()
        }));
    }

    data = await jsonld.fromRDF(data, {
      format: 'application/n-quads',
      documentLoader: customLoader
    });

    if( !format || format === 'jsonld' || format === 'application/ld+json' ) {
      return data;
    }

    if( format === 'compact' || format === 'application/ld+json; profile="http://www.w3.org/ns/json-ld#compacted"' ) {
      return jsonld.compact(data, data['@context'] || {});
    }

    if( format === 'cask' || format === 'application/ld+json; profile="http://library.ucdavis.edu/cask#compacted"' ) {
      return await this.caskCompact(data, filePath);
    }

    if( format === 'flattened' || format === 'application/ld+json; profile="http://www.w3.org/ns/json-ld#flattened"' ) {
      return jsonld.flatten(data, {});
    }

    if( format === 'expanded' || format === 'application/ld+json; profile="http://www.w3.org/ns/json-ld#expanded"' ) {
      return jsonld.expand(data);
    }

    throw new Error(`Unsupported RDF format: ${format}`);
  }

  /**
   * @method find
   * @description Find files based on subject, graph, partition, predicate or object.
   * 
   * @param {*} opts 
   */
  find(opts={}) {
    return this.dbClient.findFiles(opts);
  }

  /**
   * @method query
   * @description Internal method to query RDF data from the database based on given options.  A subject or
   * a file must be specified. Will return jsonld dataset of nodes and links that match the query.  
   * Will limit to 10,000 nodes AND 10,000 links.
   * 
   * @param {Object} opts query options
   * @param {String} opts.file file path to filter by
   * @param {String} opts.subject subject URI to filter by
   * @param {String} opts.graph graph URI to filter by (must be used with subject or file)
   * @param {String|Array} opts.partition partition key or array of partition keys to filter by
   *  
   * @returns {Promise<Object>} JSON-LD dataset of nodes and links that match the query
   */
  // async query(opts={}) {
  //   return this.dbClient.findRdfNodes(opts);
  // }



  /**
   * @function insert
   * @description Insert rdf layer for a file into the database.  This accepts a custom filepath
   * in opts for reading a tmp file during insert.
   * 
   * @param {String} fileId file ID to associate the RDF data with
   * @param {Object} opts options object
   * @param {String} opts.filepath optional file path to the RDF data file.  If not provided, will read from the CASKFS
   * 
   * @returns 
   */
  async insert(fileId, opts={}) {
    let dbClient = opts.dbClient || this.dbClient;

    let file = await dbClient.query(`
        SELECT * FROM ${config.database.schema}.file_view WHERE file_id = $1
      `, [fileId]);

    file = file.rows[0];
    let filepath = path.join(file.directory, file.filename);

    let data = '';
    let fileQuads, parserMimeType;

    if( file.metadata.resourceType === 'rdf' ) {
      data = await fsp.readFile(opts.filepath || filepath, {encoding: 'utf8'});

      if( file.metadata.mimeType === this.jsonLdMimeType ) {
        data = JSON.parse(data);

        // handle empty @id values by assigning blank cask:/ IDs
        this._setEmptyIds(data);

        fileQuads = await jsonld.canonize(data, {
          algorithm: 'URDNA2015',
          format: this.nquadsMimeType,
          safe: true,
          documentLoader: customLoader
        });

        parserMimeType = this.nquadsMimeType;
      } else {
        fileQuads = data;
        parserMimeType = file.metadata.mimeType;
      }
    } else {
      parserMimeType = this.nquadsMimeType;
    }

    const caskFileNode =  {
      '@id' : config.fileGraph,
      '@graph': [
        {
          '@id': config.schemaPrefix+filepath,
          '@type': [
            'http://library.ucdavis.edu/cask#File'
          ],
          'http://schema.org/contentUrl': {
            '@id':'file://'+filepath
          },
          'http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#filename': {
            '@value': file.filename
          },
          'http://www.loc.gov/premis/rdf/v1#hasMessageDigest': [
            {'@value': 'urn:sha-256:'+file.digests.sha256},
            {'@value': 'urn:md5:'+file.digests.md5}
          ],
          'http://www.loc.gov/premis/rdf/v1#hasSize': {
            '@value': file.size, 
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          },
          'http://purl.org/dc/terms/created': {
            '@value': file.created.toISOString(), 
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime'
          },
          'http://purl.org/dc/terms/modified': {
            '@value': file.modified.toISOString(), 
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime'
          }
        }
      ]
    }

    if( file?.metadata?.resourceType === 'rdf' ) {
      caskFileNode['@graph'][0]['@type'].push('http://library.ucdavis.edu/cask#RDFSource');
    }
    if( file.metadata.mimeType ) {
      caskFileNode['@graph'][0]['http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#hasMimeType'] = {
        '@value': file.metadata.mimeType
      };
    }

    const caskQuads = this.quadsParser.parse(
      await jsonld.canonize(caskFileNode, {
        algorithm: 'URDNA2015',
        format: 'application/n-quads',
        safe: true
      })
    );

    // merge the cask quads with the data quads
    let parser = new QuadsParser({ format: parserMimeType });
    parser.DEFAULTGRAPH = namedNode(config.defaultGraph);

    let allQuads = [];

    if( fileQuads ) {
      fileQuads = parser.parse(fileQuads);
      allQuads = [...caskQuads, ...fileQuads];
    } else {
      allQuads = caskQuads;
    }

    allQuads = allQuads
      .map(q => ({
        graph: this._resolveIdPath(q.graph.value),
        subject: this._resolveIdPath(q.subject.value, filepath),
        predicate: q.predicate.value,
        object: q.object.termType === 'NamedNode' ? this._resolveIdPath(q.object.value, filepath) : null,
        quad: q
      }));

    let types = null;

    if( fileQuads ) {
      types = new Set(fileQuads.filter(q => q.predicate.value === this.TYPE_PREDICATE)
        .map(q => q.object.value));
      types = Array.from(types);
    }
    let otherQuads = allQuads.filter(q => q.predicate !== this.TYPE_PREDICATE);

    // filter out the quad data for insertion
    let fileIdQuads = otherQuads.map(q => ({
      graph : q.graph,
      subject : q.subject,
      predicate : q.predicate,
      object : q.object
    }));

    await dbClient.query(
      `select caskfs.insert_file_ld($1::UUID, $2::JSONB, $3::JSONB)`, [
        file.file_id, 
        JSON.stringify(fileIdQuads),
        types ? JSON.stringify(types) : null
      ]);

    if( fileQuads ) {
      // ensure proper path resolution for subject IDs
      fileQuads.forEach(q => {
        q._subject = namedNode(this._resolveIdPath(q.subject.value, filepath));
      });
      fileQuads = await this._objectToNQuads(fileQuads);
    }

    return {
      file,
      links: fileIdQuads,
      types,
      fileQuads: fileQuads,
      caskQuads: await this._objectToNQuads(caskQuads)
    };
  }


  /**
   * @method relationships
   * @description Get the outbound and inbound links for a given file.
   * 
   * @param {Object} metadata file metadata record from the file_view
   * @param {Object} opts options
   * @param {String} opts.requestor user making the request (for ACL checks)
   * @param {Boolean} opts.stats if true, will ignore ACL checks (for admin users)
   * @param {String|Array} opts.predicate predicate or array of predicates to filter by
   * 
   * 
   * @returns 
   */
  async relationships(metadata, opts={}) {
    // Note, the file has been permission checked before this is called
    // so we don't need to do that here.  Just need make sure all external
    // references are filtered out.

    let [inbound, outbound] = await Promise.all([
      this.getInboundLinks(metadata.file_id, opts),
      this.getOutboundLinks(metadata.file_id, opts)
    ]);


    if( opts.debugQuery ) {
      return { outbound, inbound };
    }

    return { 
      source : {
        file: path.join(metadata.directory, metadata.filename),
        resourceType : metadata.metadata.resourceType,
        mimeType: metadata.metadata.mimeType,
        partitionKeys: metadata.partition_keys
      },
      outbound: opts.stats ? this._formatRelStatsResponse(outbound) : this._formatRelResponse(outbound),
      inbound: opts.stats ? this._formatRelStatsResponse(inbound) : this._formatRelResponse(inbound)
    };
  }

  _formatRelStatsResponse(rows) {
    let data = {};
    for( let r of rows ) {
      data[r.predicate] = parseInt(r.count, 10);
    }
    return data;
  }

  _formatRelResponse(rows) {
    let data = {};
    for( let r of rows ) {
      if( !data[r.predicate] ) data[r.predicate] = new Set();
      data[r.predicate].add(r.filepath);
    }
    for( let p of Object.keys(data) ) {
      data[p] = Array.from(data[p]);
    }

    return data;
  }

  async getInboundLinks(fileId, opts={}) {
    let args = [fileId];
    let dbClient = opts.dbClient || this.dbClient;

    let predicate = '';
    if( opts.predicate ) {
      predicate = opts.predicate;
      delete opts.predicate;
    }

    let predicateFilter = '';
    if( predicate ) {
      predicateFilter = ` AND predicate_uri_id = caskfs.get_uri_id($${args.length + 1}) `;
      args.push(predicate);
    }

    opts.withClauses = [];
    opts.intersectClauses = [];

    opts.withClauses.push(`
      target_subjects AS (
        SELECT 
          ld.uri_id AS subject_uris
        FROM ${config.database.schema}.file_ld_filter fld
        INNER JOIN ${config.database.schema}.ld_filter ld ON ld.ld_filter_id = fld.ld_filter_id
        WHERE fld.file_id = $1 AND ld.type = 'subject'
      ),
      target_subject_match AS (
        SELECT ld_link_id FROM ${config.database.schema}.ld_link
        WHERE object IN (SELECT subject_uris FROM target_subjects)
              ${predicateFilter}
      ),
      target_subject_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_link f
        INNER JOIN target_subject_match tsm ON tsm.ld_link_id = f.ld_link_id
        WHERE f.file_id != $1
      )  
    `);
    opts.intersectClauses.push(`SELECT file_id FROM target_subject_file_match`);
    
    let withFilters = dbClient.generateFileWithFilter(opts, args);

    let {table, aclQuery} = await dbClient.generateAclWithFilter(opts, args);
    if( aclQuery ) withFilters = withFilters + ', ' + aclQuery;


    let limit = '', pselect = '', groupBy = '';
    if( opts.stats ) {
      pselect = 'count(*) as count';
      groupBy = 'GROUP BY puri.uri';
    } else {
      pselect = 'f.filepath as filepath';
      limit = 'LIMIT $'+(args.length + 1);
      args.push(opts.limit || 1000);
    }

    let query = `
      WITH
      ${withFilters},
      links AS (
        SELECT * from ${config.database.schema}.file_ld_link fll
        WHERE fll.file_id IN (SELECT file_id FROM ${table})
        AND fll.ld_link_id IN (SELECT ld_link_id FROM target_subject_match)
      )
      SELECT 
        puri.uri as predicate,
        ${pselect}
      FROM links l
      LEFT JOIN ${config.database.schema}.ld_link ll ON ll.ld_link_id = l.ld_link_id
      LEFT JOIN ${config.database.schema}.uri puri ON puri.uri_id = ll.predicate
      LEFT JOIN ${config.database.schema}.simple_file_view f ON l.file_id = f.file_id
      ${groupBy}
      ${limit}`;

    if( opts.debugQuery ) {
      return { query, args  };
    }

    let res = await dbClient.query(query, args);
    return res.rows;
  }

  async getOutboundLinks(fileId, opts={}) {    
    let args = [fileId];  

    let dbClient = opts.dbClient || this.dbClient;

    // let aclJoin = '';
    // if( await acl.aclLookupRequired(aclOpts) ) {
    //   aclJoin = `LEFT JOIN ${config.database.schema}.directory_user_permissions_lookup acl_lookup ON acl_lookup.directory_id = ref_by_view.directory_id`;
      
    //   let aclWhere = [
    //     '(acl_lookup.user_id IS NULL AND acl_lookup.can_read = TRUE)'
    //   ];

    //   if( opts.userId !== null ) {
    //     aclWhere.push(`(acl_lookup.user_id = $${args.length + 1} AND acl_lookup.can_read = TRUE)`);
    //     args.push(opts.userId);
    //   }

    //   where.push(`(${aclWhere.join(' OR ')})`);
    // }

    let predicate = '';
    if( opts.predicate ) {
      predicate = opts.predicate;
      delete opts.predicate;
    }

    let predicateFilter = '';
    if( predicate ) {
      predicateFilter = ` AND predicate = caskfs.get_uri_id($${args.length + 1}) `;
      args.push(predicate);
    }

    opts.withClauses = [];
    opts.intersectClauses = [];

    opts.withClauses.push(`
      target_objects AS (
        SELECT 
          ll.object AS object_uri,
          ll.predicate AS predicate_uri
        FROM ${config.database.schema}.file_ld_link fll
        INNER JOIN ${config.database.schema}.ld_link ll ON ll.ld_link_id = fll.ld_link_id
        WHERE fll.file_id = $1 ${predicateFilter}
      ),
      target_object_match AS (
        SELECT ld_filter_id FROM ${config.database.schema}.ld_filter
        WHERE uri_id IN (SELECT object_uri FROM target_objects) AND
              type = 'subject'
      ),
      target_object_file_match AS (
        SELECT DISTINCT f.file_id FROM ${config.database.schema}.file_ld_filter f
        INNER JOIN target_object_match tom ON tom.ld_filter_id = f.ld_filter_id
        WHERE f.file_id != $1
      )
    `);
    opts.intersectClauses.push(`SELECT file_id FROM target_object_file_match`);

    let withFilters = dbClient.generateFileWithFilter(opts, args);
    let {table, aclQuery} = await dbClient.generateAclWithFilter(opts, args);
    if( aclQuery ) withFilters = withFilters + ', ' + aclQuery;

    let limit = '', pselect = '', groupBy = '';
    if( opts.stats ) {
      pselect = 'count(*) as count';
      groupBy = 'GROUP BY puri.uri';
    } else {
      pselect = 'f.filepath as filepath';
      limit = 'LIMIT $'+(args.length + 1);
      args.push(opts.limit || 1000);
    }

    let query = `
      WITH
      ${withFilters},
      links AS (
        SELECT 
          flf.*,
          lf.uri_id
        FROM ${config.database.schema}.file_ld_filter flf
        LEFT JOIN ${config.database.schema}.ld_filter lf ON lf.ld_filter_id = flf.ld_filter_id
        WHERE flf.file_id IN (SELECT file_id FROM ${table})
        AND flf.ld_filter_id IN (SELECT ld_filter_id FROM target_object_match)
      )
      SELECT 
        puri.uri as predicate,
        ${pselect}
      FROM target_objects tos
      INNER JOIN links l ON l.uri_id = tos.object_uri
      LEFT JOIN ${config.database.schema}.simple_file_view f ON l.file_id = f.file_id
      LEFT JOIN ${config.database.schema}.uri puri ON puri.uri_id = tos.predicate_uri
      ${groupBy}
      ${limit}`;

    if( opts.debugQuery ) {
      return { query, args  };
    }

    let resp = await dbClient.query(query, args);
    return resp.rows;
  }

  /**
   * @function delete
   * @description Delete all RDF data associated with a given file ID.
   * 
   * @param {Object} context 
   * @param {Object} opts
   * @param {Database} opts.dbClient optional dbClient to use for the operation.  If not provided, will use the default dbClient.
   *  
   * @returns {Promise}
   */
  async delete(fileMetadata, opts={}) {
    this.logger.info('Deleting LD data for file', fileMetadata.filepath);
    let dbClient = opts.dbClient || this.dbClient;
    await dbClient.query(
      `delete from ${config.database.schema}.file_ld_filter where file_id = $1`, 
      [fileMetadata.file_id]
    );
    await dbClient.query(
      `delete from ${config.database.schema}.file_ld_link where file_id = $1`, 
      [fileMetadata.file_id]
    );
  }

  _getContextProperty(uri='') {
    if( uri.endsWith('#') || uri.endsWith('/') ) {
      uri = uri.slice(0, -1);
    }
    return {
      uri,
      property : uri.split(/[\/#]/).pop()
    }
  }

  _objectToNQuads(objects) {
    let writer = new QuadsWriter({ format: 'N-Triples' });
    writer.addQuads(objects);
    return new Promise((resolve, reject) => {
      writer.end((error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  /**
   * @function _resolveIdPath
   * @description Resolve an ID to a full path based on the filePath.
   * 
   * @param {*} id 
   * @param {*} filepath 
   * @returns 
   */
  _resolveIdPath(id='', filepath='') {
    if( id === './' ) id = '';

    // no path provided, id is the file path
    if( !id ) {
      if( !filepath ) return config.defaultGraph;
      return config.schemaPrefix+filepath.replace(this.jsonldExt, '');
    }

    // if id is a cask:/ URI, resolve it based on the filepath
    if( id.startsWith(config.schemaPrefix) ) {
      // remove the cask:/ prefix
      id = id.slice(config.schemaPrefix.length);

      if( id === '' ) return config.schemaPrefix+filepath.replace(this.jsonldExt, '');

      if( id.startsWith('/') ) {
        return config.schemaPrefix+id;
      } else if ( filepath ) {
        return config.schemaPrefix+path.resolve(path.dirname(filepath), id);
      } else {
        return config.schemaPrefix+id;
      }
    }

    if( !id.match(/^[a-z0-9+.-]+:/i) ) {
      if( !id ) id = 'default';
      return config.schemaPrefix+id;
    }

    // otherwise, return the id as-is
    return id;
  }

  async caskCompact(data, filePath='') {
    const nquads = await jsonld.canonize(data, {
      algorithm: 'URDNA2015',
      format: 'application/n-quads'
    });

    let nodes = {}
    this.quadsParser.parse(nquads)
      .forEach(q => {
        if( !nodes[q.subject.value] ) {
          nodes[q.subject.value] = {
            '@id': this._resolveIdPath(q.subject.value, filePath),
            '@type': [],
          };
        }
        let node = nodes[q.subject.value];
        this._caskCompactMergeProperty(node, q.predicate.value, q.object, filePath);
      });

    return Object.values(nodes);
  }

  _caskCompactMergeProperty(node, property, object, filePath='') {
    let value;
    if( property === this.TYPE_PREDICATE ) {
      property = '@type';
      value = this._getContextProperty(object.value).property;
    } else if( object.termType === 'Literal' ) {
      // TODO handle data type 
      property = this._getContextProperty(property).property;
      value = object.value;
      let type = object?.datatype?.value;

      if( type === 'http://www.w3.org/2001/XMLSchema#integer' ) {
        value = parseInt(value);
      } else if( type === 'http://www.w3.org/2001/XMLSchema#decimal' || type === 'http://www.w3.org/2001/XMLSchema#double' ) {
        value = parseFloat(value);
      } else if( type === 'http://www.w3.org/2001/XMLSchema#boolean' ) {
        value = (value === 'true' || value === '1');
      } else if( type === 'http://www.w3.org/2001/XMLSchema#dateTime' ) {
        value = new Date(value).toISOString();
      } else if ( value.toLowerCase().trim() === 'true' || value.toLowerCase().trim() === 'false' ) {
        value = (value.toLowerCase().trim() === 'true');
      }

    } else {
      property = this._getContextProperty(property).property;
      value = this._resolveIdPath(object.value, filePath);
    }

    if( !node[property] ) {
      node[property] = value;
    } else if( Array.isArray(node[property]) ) {
      if( !node[property].includes(value) ) {
        node[property].push(value);
      }
    } else if( node[property] !== value ) {
      node[property] = [node[property], value];
    }
  }

  _setEmptyIds(data) {
    if( Array.isArray(data) ) {
      data.forEach(d => this._setEmptyIds(d));
    } else if( typeof data === 'object' && data !== null ) {
      if( data['@id'] === '' ) {
        data['@id'] = config.schemaPrefix;
      }
      if( data['@id'] && data['@id'].startsWith('@base:') ) {
        data['@id'] = data['@id'].replace(/^@base:\/?/, config.schemaPrefix);
      }
      for( let k of Object.keys(data) ) {
        if( k !== '@id' && k !== '@type' ) {
          this._setEmptyIds(data[k]);
        }
      }
    }
  }

}

export default Rdf;