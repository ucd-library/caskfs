import { Parser as QuadsParser, Writer as QuadsWriter } from "n3";
import jsonld from "jsonld";
import Database from "./database/index.js";
import config from "./config.js";
import path from "path";
import fsp from "fs/promises";
import { getLogger } from './logger.js';

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
   * @description Read RDF data from the CASKFS and return in the specified format.  A containment or subject
   * must be specified.  Will return a JSON-LD dataset by default, or can return in other RDF formats.
   *
   * @param {Object} opts
   * @param {String} opts.containment containment file path to filter by
   * @param {String} opts.subject subject URI to filter by
   * @param {String} opts.graph graph URI to filter by (must be used with subject or containment)
   * @param {String|Array} opts.partition partition key or array of partition keys to filter by
   * @param {String} opts.format RDF format to return: jsonld (default), compact, cask, flattened, expanded, nquads, json
   * 
   * @returns {Promise<Object>} RDF data in the specified format
   */
  async read(opts={}) {
    let format = opts.format;
    let filePath = opts.containment;

    if( opts.subject && opts.subject.startsWith('/') ) {
      opts.subject = config.schemaPrefix + opts.subject;
    }

    let data = await this.query(opts);

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

    if( format === 'nquads' || format === 'application/n-quads' ) {
      return jsonld.canonize(data, {
        algorithm: 'URDNA2015',
        format: 'application/n-quads'
      });
    }

    if( format === 'json' || format === 'application/json' ) {
      const nquads = await jsonld.canonize(data, {
        algorithm: 'URDNA2015',
        format: 'application/n-quads'
      });

      return this.quadsParser.parse(nquads)
        .map(q => ({
          graph: q.graph.value || null,
          subject: q.subject.value,
          predicate: q.predicate.value,
          object: q.object.toJSON()
        }));
    }

    throw new Error(`Unsupported RDF format: ${format}`);
  }

  /**
   * @method find
   * @description Find files (containments) based on subject, graph, partition, predicate or object.
   * 
   * @param {*} opts 
   */
  find(opts={}) {
    return this.dbClient.findContainments(opts);
  }

  /**
   * @method query
   * @description Internal method to query RDF data from the database based on given options.  A subject or
   * a containment must be specified. Will return jsonld dataset of nodes and links that match the query.  
   * Will limit to 10,000 nodes AND 10,000 links.
   * 
   * @param {Object} opts query options
   * @param {String} opts.containment containment file path to filter by
   * @param {String} opts.subject subject URI to filter by
   * @param {String} opts.graph graph URI to filter by (must be used with subject or containment)
   * @param {String|Array} opts.partition partition key or array of partition keys to filter by
   *  
   * @returns {Promise<Object>} JSON-LD dataset of nodes and links that match the query
   */
  async query(opts={}) {
    return this.dbClient.findRdfNodes(opts);
  }

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
  async insert(context, opts={}) {
    let dbClient = opts.dbClient || this.dbClient;

    let file = await dbClient.query(`
        SELECT * FROM ${config.database.schema}.file_view WHERE file_id = $1
      `, [context.file.file_id]);

    file = file.rows[0];
    let filepath = path.join(file.directory, file.filename);

    let data = '';
    let nquads, parserMimeType;

    if( file.metadata.resource_type === 'rdf' ) {
      data = await fsp.readFile(opts.filepath || filepath, {encoding: 'utf8'});

      if( file.metadata.mimeType === this.jsonLdMimeType ) {
        data = JSON.parse(data);

        // handle empty @id values by assigning blank cask:/ IDs
        this._setEmptyIds(data);

        nquads = await jsonld.canonize(data, {
          algorithm: 'URDNA2015',
          format: this.nquadsMimeType,
          safe: true,
          documentLoader: customLoader
        });

        parserMimeType = this.nquadsMimeType;
      } else {
        nquads = data;
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
            'http://library.ucdavis.edu/cask#File',
            'http://library.ucdavis.edu/cask#Containment'
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
            '@value': file.created, 
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime'
          },
          'http://purl.org/dc/terms/modified': {
            '@value': file.modified, 
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime'
          },
          'http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#hasMimeType': {
            '@value': file.metadata.mimeType
          }
        }
      ]
    }

    if( file?.metadata?.resource_type === 'rdf' ) {
      caskFileNode['@graph'][0]['@type'].push('http://library.ucdavis.edu/cask#RDFSource');
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
    const quads = [...caskQuads, ...parser.parse(nquads)];

    const literalQuads = quads
      .filter(q => q.subject.termType === 'NamedNode' && q.predicate.termType === 'NamedNode' && q.object.termType !== 'NamedNode')
      .map(q => ({
        graph: this._resolveIdPath(q.graph.value),
        subject: this._resolveIdPath(q.subject.value, filepath),
        predicate: q.predicate.value,
        object: q.object.value,
        quad : q
      }));

    const nodeData = {};

    for( let lq of literalQuads ) {
      if( !nodeData[lq.graph || this.defaultGraph] ) {
        nodeData[lq.graph || this.defaultGraph] = {};
      }
      let graphNode = nodeData[lq.graph || this.defaultGraph];

      if( !graphNode[lq.subject] ) {
        graphNode[lq.subject] = {
          data : {'@id': lq.subject},
          context : {},
          quads: []
        }
      }
      let node = graphNode[lq.subject];

      let prop = this._getContextProperty(lq.predicate);
      node.context[prop.property] = {'@id': prop.uri};
      if( !node.data[prop.property] ) {
        node.data[prop.property] = lq.object;
      } else if( Array.isArray(node.data[prop.property]) ) {
        node.data[prop.property].push(lq.object);
      } else {
        node.data[prop.property] = [node.data[prop.property], lq.object];
      }

      node.quads.push(lq.quad);
    }

    // parse the nquads into quads
    const namedQuads = quads
      .filter(q => q.subject.termType === 'NamedNode' && q.predicate.termType === 'NamedNode' && q.object.termType === 'NamedNode')
      .map(q => {
        return {
          graph: this._resolveIdPath(q.graph.value),
          subject: this._resolveIdPath(q.subject.value, filepath),
          predicate: this._resolveIdPath(q.predicate.value),
          object: this._resolveIdPath(q.object.value, filepath),
          quad: q
        };
      });

    // TODO filter out RDF type triples and store in rdf_types table
    let typeQuads = namedQuads.filter(q => q.predicate === this.TYPE_PREDICATE);
    let otherQuads = namedQuads.filter(q => q.predicate !== this.TYPE_PREDICATE);

    // append types to the nodes themselves
    if( typeQuads.length > 0 ) {
      for( let tq of typeQuads ) {
        if( !nodeData[tq.graph || this.defaultGraph] ) {
          nodeData[tq.graph || this.defaultGraph] = {};
        }
        let graphNode = nodeData[tq.graph || this.defaultGraph];
        if( !graphNode[tq.subject] ) {
          graphNode[tq.subject] = {
            data : {
              '@id': tq.subject,
            },
            context : {},
            quads: []
          }
        }
        let node = graphNode[tq.subject];
        if( !node.data['@type'] ) {
          node.data['@type'] = [];
        }

        let prop = this._getContextProperty(tq.object);
        node.data['@type'].push(prop.property);
        node.context[prop.property] = {'@id': prop.uri, '@type': '@id'};
        node.quads.push(tq.quad);
      }
    }

    // create node structure for insertion
    let nodes = [];
    for( let g of Object.keys(nodeData) ) {
      for( let s of Object.keys(nodeData[g]) ) {
        let node = nodeData[g][s];
        node.graph = g;
        node.subject = s;
        node.nquads = await this._objectToNQuads(node.quads);
        nodes.push(node);
      }
    }

    await dbClient.query(`select caskfs.insert_rdf_link_bulk($1::UUID, $2::JSONB)`, [context.file.file_id, JSON.stringify(otherQuads)]);
    await dbClient.query(`select caskfs.insert_rdf_node_bulk($1::UUID, $2::JSONB)`, [context.file.file_id, JSON.stringify(nodes)]);

    return {
      context,
      links: otherQuads,
      nodes: nodeData
    };
  }


  /**
   * @method links
   * @description Get the outbound and inbound links for a given containment record.
   * 
   * @param {Object} metadata 
   * @param {String} predicate 
   * 
   * @returns 
   */
  async links(metadata, opts={}) {
    let [outbound, inbound] = await Promise.all([
      this.getReferences(metadata.file_id, opts),
      this.getReferencedBy(metadata.file_id, opts)
    ]);

    return { 
      source : {
        fileId: metadata.file_id,
        filepath: path.join(metadata.directory, metadata.filename),
        resourceType : metadata.metadata.resource_type,
        mimeType: metadata.metadata.mimeType
      },
      outbound, inbound 
    };
  }

  async getReferences(fileId, opts={}) {
    let where = ['source_view.file_id = $1', 'target_view.file_id != $1'];
    let args = [fileId];

    if( opts.predicate ) {
      if( !Array.isArray(opts.predicate) ) {
        opts.predicate = [opts.predicate];
      }
      where.push(`source_view.predicate @> $${args.length + 1}::VARCHAR(256)[]`);
      args.push(opts.predicate);
    }

    if( opts.ignorePredicate ) {
      if( !Array.isArray(opts.ignorePredicate) ) {
        opts.ignorePredicate = [opts.ignorePredicate];
      }
      where.push(`source_view.predicate <> ALL ($${args.length + 1}::VARCHAR(256)[])`);
      args.push(opts.ignorePredicate);
    }

    if( opts.partitionKeys ) {
      if( !Array.isArray(opts.partitionKeys) ) {
        opts.partitionKeys = [opts.partitionKeys];
      }
      where.push(`target_view.partition_keys @> $${args.length + 1}::VARCHAR(256)[]`);
      args.push(opts.partitionKeys);
    }

    if( opts.graph ) {
      where.push(`target_view.graph = $${args.length + 1}`);
      args.push(opts.graph);
    }

    if( opts.subject ) {
      where.push(`source_view.subject = $${args.length + 1}`);
      args.push(opts.subject);
    }

    let limit = 'LIMIT $'+(args.length + 1);
    args.push(opts.limit || 100);

    let res = await this.dbClient.query(`WITH links AS (
        SELECT 
            target_view.file_id,
            target_view.containment,
            target_view.graph,
            source_view.subject as source_subject,
            source_view.predicate,
            target_view.subject as target_subject,
            target_view.object as target_object
        FROM caskfs.rdf_link_view source_view
        -- Find other files where this object URI appears as a subject
        JOIN caskfs.rdf_link_view target_view ON source_view.object = target_view.subject
        WHERE ${where.join(' AND ')}
    ),
    nodes AS (
        SELECT 
            target_view.file_id,
            target_view.containment,
            target_view.graph,
            source_view.subject AS source_subject,
            source_view.predicate,
            target_view.subject AS target_subject,
            data::text AS target_object
        FROM caskfs.rdf_link_view source_view
        JOIN caskfs.rdf_node_view target_view ON source_view.object = target_view.subject
        WHERE ${where.join(' AND ')}
    )
    SELECT * FROM links
    UNION
    SELECT * FROM nodes
    ${limit}`, args);

    return res.rows;
  }

  async getReferencedBy(fileId, opts={}) {
    // let where = ['target_view.file_id != $1', 'source_view.subject = target_view.object'];
    // let args = [fileId];
    
    let where = ['target_view.file_id != $1'];
    let args = [fileId];  

    if( opts.predicate ) {
      if( !Array.isArray(opts.predicate) ) {
        opts.predicate = [opts.predicate];
      }
      where.push(`target_view.predicate @> $${args.length + 1}::VARCHAR(256)[]`);
      args.push(opts.predicate);
    }

    if( opts.ignorePredicate ) {
      if( !Array.isArray(opts.ignorePredicate) ) {
        opts.ignorePredicate = [opts.ignorePredicate];
      }
      where.push(`target_view.predicate <> ALL ($${args.length + 1}::VARCHAR(256)[])`);
      args.push(opts.ignorePredicate);
    }

    if( opts.partitionKeys ) {
      if( !Array.isArray(opts.partitionKeys) ) {
        opts.partitionKeys = [opts.partitionKeys];
      }
      where.push(`target_view.partition_keys @> $${args.length + 1}::VARCHAR(256)[]`);
      args.push(opts.partitionKeys);
    }

    if( opts.graph ) {
      where.push(`target_view.graph = $${args.length + 1}`);
      args.push(opts.graph);
    }

    // TODO: filter early
    if( opts.subject ) {
      where.push(`source_view.subject = $${args.length + 1}`);
      args.push(opts.subject);
    }

    let limit = 'LIMIT $'+(args.length + 1);
    args.push(opts.limit || 100);

    let resp = await this.dbClient.query(`
        WITH distinct_subjects AS (
          SELECT DISTINCT rv.subject
          FROM caskfs.rdf_link_view rv
          WHERE rv.file_id = $1
          UNION
          SELECT DISTINCT rn.subject
          FROM caskfs.rdf_node_view rn
          WHERE rn.file_id = $1
      ), 
      links AS (
          SELECT * FROM caskfs.rdf_link_view target_view
          WHERE ${where.join(' AND ')}
      )
      SELECT 
          target_view.file_id,
          target_view.containment,
          target_view.graph,
          source_view.subject as source_subject,
          target_view.subject as target_subject,
          target_view.predicate,
          target_view.object as target_object
          FROM distinct_subjects source_view
          -- Find other files where this object URI appears as a subject
          INNER JOIN links target_view ON source_view.subject = target_view.object
          ${limit}
      `, args);

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
  delete(context, opts={}) {
    this.logger.info('Deleting RDF data for file', context.logContext);
    return (opts.dbClient || this.dbClient).query('select caskfs.remove_rdf_by_file($1)', [context.file.file_id]);
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

  async caskCompact(data, containment) {
    const nquads = await jsonld.canonize(data, {
      algorithm: 'URDNA2015',
      format: 'application/n-quads'
    });

    let nodes = {}
    this.quadsParser.parse(nquads)
      .forEach(q => {
        if( !nodes[q.subject.value] ) {
          nodes[q.subject.value] = {
            '@id': this._resolveIdPath(q.subject.value, containment),
            '@type': [],
          };
        }
        let node = nodes[q.subject.value];
        this._caskCompactMergeProperty(node, q.predicate.value, q.object, containment);
      });

    return Object.values(nodes);
  }

  _caskCompactMergeProperty(node, property, object, containment) {
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
      value = this._resolveIdPath(object.value, containment);
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

// EXPLAIN ANALYZE
// WITH distinct_subjects AS (
//           SELECT DISTINCT rv.subject
//           FROM caskfs.rdf_link_view rv
//           WHERE rv.file_id = '088f54db-9bf7-46eb-9acb-46dc44a0a9a4'
//           UNION
//           SELECT DISTINCT rn.subject
//           FROM caskfs.rdf_node_view rn
//           WHERE rn.file_id = '088f54db-9bf7-46eb-9acb-46dc44a0a9a4'
//       )
//       SELECT 
//           target_view.file_id,
//           target_view.containment,
//           target_view.graph,
//           target_view.subject as target_subject,
//           target_view.predicate,
//           target_view.object as source_object
//           FROM distinct_subjects source_view
//           -- Find other files where this object URI appears as a subject
//           INNER JOIN caskfs.rdf_link_view target_view ON 
//             target_view.file_id != '088f54db-9bf7-46eb-9acb-46dc44a0a9a4' AND source_view.subject = target_view.object;