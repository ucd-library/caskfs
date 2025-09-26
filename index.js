import PgClient from "./lib/pg-client.js";
import path from "path";
import config from "./lib/config.js";
import mime from "mime";
import Cas from "./lib/cas.js";
import Rdf from "./lib/rdf.js";
import Directory from "./lib/directory.js";

class CaskFs {

  constructor(opts={}) {
    this.pgClient = opts.pgClient || new PgClient();
    this.rootDir = config.rootDir;
    this.schema = config.pgSchema;
    this.schemaPrefix = config.schemaPrefix;

    this.jsonldExt = '.jsonld.json';
    this.jsonLdMimeType = 'application/ld+json';
    this.nquadsMimeType = 'application/n-quads';
    this.n3MimeType = 'text/n3';
    this.turtleMimeType = 'text/turtle';

    this.cas = new Cas({pgClient: this.pgClient});
    this.rdf = new Rdf({
      pgClient: this.pgClient,
      cas: this.cas
    });
    this.directory = new Directory({pgClient: this.pgClient});
  }

  async exists(filePath) {
    let fileParts = path.parse(filePath);
    let res = await this.pgClient.query(`
      SELECT 1 FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);
    
    return res.rows.length > 0;
  }

  /**
   * @method write
   * @description Write a file to the CASKFS. Can write from a Buffer, Readable Stream, hash value or file path.
   * 
   * @param {String} filePath file path to write to in the CASKFS
   * @param {Buffer} data data buffer to write
   * @param {Object} opts options object
   * @param {String} opts.readPath path to a file to read and write to the CASKFS
   * @param {Stream} opts.readStream readable stream to read and write to the CASKFS
   * @param {String} opts.hash existing hash value of a file already in the CASKFS to reference
   * @param {Buffer} opts.data data Buffer to write to the CASKFS
   * @param {Boolean} opts.replace if true, replace existing file at filePath. Default is false (error if exists)
   * @param {String} opts.mimeType MIME type of the file being written. Default is auto-detected from file extension.
   * @param {String} opts.contentType same as mimeType, for compatibility with other systems
   * @param {Array} opts.partitionKeys array of partition keys to associate with the file
   * 
   * @returns {Object} result object with copied (boolean) and fileId (string)
   */
  async write(filePath, opts={}) {

    // open single connection to postgres and start a transaction
    let pgClient = new PgClient();
    await pgClient.connect();

    let tmpFile, hashFile, digests, metadata, fileId;
    let deletedHashValue;

    //any operations that fail should rollback the transaction and delete the temp file
    try {
      await pgClient.query('BEGIN');

      let exists = await this.exists(filePath);
      if( opts.replace === true && exists ) {
        let resp = await this.delete(filePath, {pgClient, softDelete: true});
        deletedHashValue = resp.metadata.hash_value;
      } else if( opts.replace !== true && exists ) {
        throw new Error(`File already exists in CASKFS: ${filePath}`);
      }

      // stage the write to get the hash value and write the temp file
      let casResp = await this.cas.stageWrite(opts);
      tmpFile = casResp.tmpFile;
      hashFile = casResp.hashFile;
      digests = casResp.digests;
      metadata = casResp.metadata;

      // attempt to get mime type
      // if passed in, use that, otherwise try to detect from file extension
      metadata.mimeType = opts.mimeType || opts.contentType;
      if( !metadata.mimeType ) {
        // if known RDF extension, set to JSON-LD
        if( filePath.endsWith(this.jsonldExt) || opts?.readPath?.endsWith(this.jsonldExt) ) {
          metadata.mimeType = this.jsonLdMimeType;
        } else {
          // otherwise try to detect from file extension
          metadata.mimeType = mime.getType(filePath);
        }
        // if still not found and we have a readPath, try to detect from that
        if( !metadata.mimeType && opts.readPath ) {
          metadata.mimeType = mime.getType(opts.readPath);
        }
      }

      // determine resource type based on mime type or file extension
      if( metadata.mimeType === this.nquadsMimeType || 
          metadata.mimeType === this.jsonLdMimeType || 
          metadata.mimeType === this.n3MimeType ||
          metadata.mimeType === this.turtleMimeType || 
          opts.readPath?.endsWith(this.jsonldExt) ) {
        metadata.resource_type = 'rdf';
      } else {
        metadata.resource_type = 'file';
      }

      // parse out file parts
      let fileParts = path.parse(filePath);

      // create all directories in the path if they do not exist
      // and get the directory ID of the target directory
      let directoryId = await this.directory.mkdir(fileParts.dir, {pgClient});

      // build the full set of partition keys
      let partitionKeySet = new Set(opts.partitionKeys || []);
      let autoPartitions = await this.getPartitionKeysFromPath(filePath);
      // add any auto-detected partition keys
      autoPartitions.forEach(part => partitionKeySet.add(part));
      opts.partitionKeys = Array.from(partitionKeySet);
      // if no partition keys, set to null so we store as empty array
      if( opts.partitionKeys.length === 0 ) {
        opts.partitionKeys = null;
      }

      // write the file record
      let primaryDigest = config.digests[0];
      let resp = await pgClient.query(`
        select * from ${this.schema}.insert_file(
          p_directory_id := $1::UUID,
          p_filename := $2::VARCHAR(256),
          p_hash_value := $3::VARCHAR(256),
          p_metadata := $4::JSONB,
          p_partition_keys := $5::VARCHAR(256)[]
        )
      `, [directoryId, fileParts.base, digests[primaryDigest], metadata, opts.partitionKeys]);


      fileId = resp.rows[0].insert_file;

      // if we have rdf data, process it now
      if( metadata.resource_type === 'rdf' ) {
        await this.rdf.insert(fileId, {pgClient, filepath: tmpFile});
      }

      // finally commit the transaction
      await pgClient.query('COMMIT');
    } catch (err) {
      // if any error, rollback the transaction and delete the temp file
      await pgClient.query('ROLLBACK');
      if( tmpFile ) {
        await this.cas.abortWrite(tmpFile);
      }
      await pgClient.end();

      throw err;
    }

    // finalize the write to move the temp file to its final location
    let copied = await this.cas.finalizeWrite(tmpFile, hashFile);

    // if we replaced an existing file, and the hash value is no longer referenced, delete it
    // this function will only delete the hash file if no other references exist
    if( deletedHashValue ) {
      await this.cas.delete(deletedHashValue);
    }

    // close the pg client socket connection
    await pgClient.end();

    return {
      copied,
      diskpath: hashFile,
      fileId,
      metadata
    };
  }

  /**
   * @method patchMetadata
   * @description Update the metadata and/or partition keys for a file in the CASKFS.
   * 
   * @param {String} filePath file path to update 
   * @param {Object} opts 
   * @param {Object} opts.metadata metadata object to merge with existing metadata
   * @param {String|Array} opts.partitionKeys partition key or array of partition keys to add
   * 
   * @returns {Promise<Object>} updated metadata object
   */
  async patchMetadata(filePath, opts={}) {
    let fileParts = path.parse(filePath);
    let currentMetadata = await this.metadata(filePath);

    if( opts.metadata ) {
      await this.pgClient.query(`
        UPDATE ${this.schema}.file SET metadata = metadata || $1::JSONB
        WHERE directory = $2 AND filename = $3
        RETURNING *
      `, [opts.metadata || {}, fileParts.dir, fileParts.base]);
    }

    if ( opts.partitionKeys ) {
      if( !Array.isArray(opts.partitionKeys) ) {
        opts.partitionKeys = [opts.partitionKeys];
      }

      await this.pgClient.query(`
          UPDATE ${this.schema}.file SET partition_keys = partition_keys
        WHERE directory = $2 AND filename = $3
        RETURNING *
        `, [opts.partitionKeys || {}, fileParts.dir, fileParts.base]);
    }

    return this.metadata(filePath);
  }

  async metadata(filePath, opts={}) {
    let fileParts = path.parse(filePath);
    let res = await this.pgClient.query(`
      SELECT * FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);
    
    if( res.rows.length === 0 ) {
      throw new Error(`File not found in CASk FS: ${filePath}`);
    }

    let data = res.rows[0];
    data.fullPath = this.cas.diskPath(data.hash_value);

    if( opts.stats ) {
      res = await this.pgClient.query(`
        SELECT COUNT(*) AS count FROM ${this.schema}.rdf_link WHERE file_id = $1
      `, [data.file_id]);
      data.rdfLinks = parseInt(res.rows[0].count);

      res = await this.pgClient.query(`
        SELECT COUNT(*) AS count FROM ${this.schema}.rdf_node WHERE file_id = $1
      `, [data.file_id]);
      data.rdfNodes = parseInt(res.rows[0].count);
    }

    return data;
  }

  /**
   * @method read
   * @description Read a file contents from the CASKFS. Can return as a stream or buffer.
   * 
   * @param {String} filePath file path to read
   * @param {Object} opts options object
   * @param {Boolean} opts.stream if true, return a stream. If false, return a Promise to content. Default: false
   * @param {String} opts.encoding encoding to use when reading the file. Default: null (buffer)
   * 
   * @returns {Promise<Buffer>|Stream} file contents as a Buffer or Stream
   */
  async read(filePath, opts={}) {
    let fileParts = path.parse(filePath);
    let res = await this.pgClient.query(`
      SELECT hash_value FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);

    if( res.rows.length === 0 ) {
      throw new Error(`File not found in CASKFS: ${filePath}`);
    }

    let hash = res.rows[0].hash_value;

    return this.cas.read(hash, opts);
  }

  async links(filePath, opts={}) {
    // get file ID
    let metadata = await this.metadata(filePath);
    return this.rdf.links(metadata, opts);
  }

  /**
   * @method ls
   * @description List files in the CASKFS. Can filter by directory, partition keys, or hash value.
   * 
   * @param {Object} opts query options
   * @param {String} opts.directory directory to list
   * 
   * @returns {Object} result object with query and files array
   */
  async ls(opts={}) {
    let args = [];
    let where = [];
    let childDirectories = null;

    if( !opts.directory ) {
      throw new Error('Directory is required');
    }

    let dir = await this.directory.get(opts.directory);
    let childDirs = await this.directory.getChildren(opts.directory);
    
    let res = await this.pgClient.query(`
      SELECT * FROM ${this.schema}.file_view WHERE directory_id = $1 ORDER BY directory, filename
    `, [dir.directory_id]);

    res.rows.map(row => {
      row.fullPath = this.cas.diskPath(row.hash_value);
    });

    return {
      files : res.rows,
      directories: childDirs
    }
  }

  async stats() {
    let res = await this.pgClient.query(`
      SELECT * from ${this.schema}.stats
    `);
    return res.rows[0];
  }

  /**
   * @method delete
   * @description Delete a file from the CASKFS. Removes the file record, partition keys, RDF triples, and
   * then calls the CAS delete method to remove the file from storage if no other references exist.
   * 
   * @param {String} filePath file path to delete 
   * @param {Objects} opts options object
   * @param {PgClient} opts.pgClient optional postgres client to use
   * @param {Boolean} opts.softDelete if true, perform a soft delete removing the file from db but leaving hash
   *                                  file on disk even if no other references exist. Default: false 
   * @returns {Promise<Object>} result object with metadata, fileDeleted (boolean), referencesRemaining (int)
   */
  async delete(filePath, opts={}) {
    let pgClient = opts.pgClient || this.pgClient;
    let metadata = await this.metadata(filePath);

    // remove RDF triples first
    this.rdf.delete(metadata.file_id);

    // remove the partition record
    // await pgClient.query(`
    //   DELETE FROM ${this.schema}.partition_keys WHERE file_id = $1
    // `, [metadata.file_id]);

    // remove the file record
    await pgClient.query(`
      DELETE FROM ${this.schema}.file WHERE file_id = $1
    `, [metadata.file_id]);

    let casResp = await this.cas.delete(metadata.hash_value, opts);

    return {
      metadata,
      fileDeleted : casResp.fileDeleted,
      referencesRemaining: casResp.referencesRemaining
    };
  }

  async getAutoPathPartions(force=false) {
    if( this.autoPathPartitions && !force ) {
      return this.autoPathPartitions;
    }

    let resp = await this.pgClient.query(`
      SELECT * FROM ${this.schema}.auto_path_partition
    `);

    resp.rows.forEach(row => {
      if( row.filter_regex ) {
        row.filter_regex = new RegExp(row.filter_regex);
      }
    });
    this.autoPathPartitions = resp.rows;

    return this.autoPathPartitions;
  }

  async setAutoPathPartition(opts={}) {
    if( !opts.name ) {
      throw new Error('Name is required');
    }

    if( !opts.filterRegex && !opts.index ) {
      throw new Error('Either filterRegex or position is required');
    }

    if( opts.index < 1 ) {
      throw new Error('Position is required and must be greater than 0');
    }

    await this.pgClient.query(`
      INSERT INTO ${this.schema}.auto_path_partition (name, index, filter_regex)
      VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET index = EXCLUDED.index, filter_regex = EXCLUDED.filter_regex
    `, [opts.name, opts.index || null, opts.filterRegex ? opts.filterRegex : null]);
  }

  async getPartitionKeysFromPath(filePath) {
    let fileParts = path.parse(filePath);
    let dirParts = fileParts.dir.split('/').filter(p => p !== '');

    let partitions = [];
    (await this.getAutoPathPartions()).forEach(part => {
      if( part.index === 'string' ) {
        part.index = parseInt(part.index);
      }

      if( part.index && dirParts.length >= part.index ) {
        dirParts = [dirParts[part.index - 1]];
      }

      if( part.filter_regex ) {
        dirParts = dirParts.filter(p => part.filter_regex.test(p));
      }

      if( dirParts.length > 0 ) {
        partitions.push(part.name+'-'+dirParts[0]);
      }
    });

    return partitions;
  }
}

export default CaskFs;