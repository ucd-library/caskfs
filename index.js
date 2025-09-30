import Database from "./lib/database/index.js";
import path from "path";
import config from "./lib/config.js";
import mime from "mime";
import Cas from "./lib/cas.js";
import Rdf from "./lib/rdf.js";
import Directory from "./lib/directory.js";
import getLogger from "./lib/logger.js";

class CaskFs {

  constructor(opts={}) {
    this.dbClient = new Database({
      client: opts.dbClient,
      type: opts.dbType || config.database.client
    });

    this.rootDir = config.rootDir;
    this.schema = config.database.schema;
    this.schemaPrefix = config.schemaPrefix;

    this.logger = getLogger('caskfs');

    this.jsonldExt = '.jsonld.json';
    this.jsonLdMimeType = 'application/ld+json';
    this.nquadsMimeType = 'application/n-quads';
    this.n3MimeType = 'text/n3';
    this.turtleMimeType = 'text/turtle';

    this.cas = new Cas({dbClient: this.dbClient});
    this.rdf = new Rdf({
      dbClient: this.dbClient,
      cas: this.cas
    });
    this.directory = new Directory({dbClient: this.dbClient});
  }

  /**
   * @method exists
   * @description Check if a file exists in the CASKFS.
   *
   * @param {String} filePath file path to check
   *
   * @returns {Boolean} true if the file exists, false otherwise
   */
  exists(filePath) {
    return this.dbClient.fileExists(filePath);
  }

  /**
   * @method write
   * @description Write a file to the CASKFS. Can write from a Buffer, Readable Stream, hash value or file path.
   *
   * @param {FileContext} context file context to write to in the CASKFS
   * @param {Buffer} data data buffer to write
   * @param {Object} opts options object
   * @param {String} opts.readPath path to a file to read and write to the CASKFS
   * @param {Stream} opts.readStream readable stream to read and write to the CASKFS
   * @param {String} opts.hash existing hash value of a file already in the CASKFS to reference
   * @param {Buffer} opts.data data Buffer to write to the CASKFS
   * @param {Boolean} opts.replace if true, replace existing file at filePath. Default is false (error if exists)
   * @param {Boolean} opts.softDelete if true, perform a soft delete replacing the file in db but leaving hash value
   *                                  on disk even if no other references exist. Default: false
   * @param {String} opts.mimeType MIME type of the file being written. Default is auto-detected from file extension.
   * @param {String} opts.contentType same as mimeType, for compatibility with other systems
   * @param {Array} opts.partitionKeys array of partition keys to associate with the file
   *
   * @returns {Object} result object with copied (boolean) and fileId (string)
   */
  async write(context, opts={}) {
    if( !context || !context.file ) {
      throw new Error('FileContext with file path is required');
    }
    let filePath = context.file;

    // open single connection to postgres and start a transaction
    let dbClient = new Database({
      type: opts.dbType || config.database.client
    });
    await dbClient.connect();

    let hashFile, digests, metadata = {}, currentMetadata, fileId;
    let deletedHashValue, hashExists = false, fileExists = false;

    //any operations that fail should rollback the transaction and delete the temp file
    try {
      await dbClient.query('BEGIN');

      fileExists = await dbClient.fileExists(filePath);
      if( opts.replace === true && fileExists ) {
        this.logger.info(`Replacing existing file in CASKFS: ${filePath}`, context.logContext);
        context.update({file: await this.metadata(filePath)});
        currentMetadata = context.file;
      } else if( opts.replace !== true && fileExists ) {
        throw new Error(`File already exists in CASKFS: ${filePath}`);
      }

      // stage the write to get the hash value and write the temp file
      await this.cas.stageWrite(context, opts);


      // attempt to get mime type
      // if passed in, use that, otherwise try to detect from file extension
      metadata.mimeType = opts.mimeType || opts.contentType;
      if( !metadata.mimeType ) {
        this.logger.debug('Attempting to auto-detect mime type, not specified in options');

        // if known RDF extension, set to JSON-LD
        if( filePath.endsWith(this.jsonldExt) || opts?.readPath?.endsWith(this.jsonldExt) ) {
          this.logger.debug('Detected JSON-LD file based on file extension');
          metadata.mimeType = this.jsonLdMimeType;
        } else {
          this.logger.debug('Detecting mime type from file extension using mime package');
          // otherwise try to detect from file extension
          metadata.mimeType = mime.getType(filePath);
        }
        // if still not found and we have a readPath, try to detect from that
        if( !metadata.mimeType && opts.readPath ) {
          this.logger.debug('Detecting mime type from readPath file extension using mime package');
          metadata.mimeType = mime.getType(opts.readPath);
        }
      }

      // determine resource type based on mime type or file extension
      if( metadata.mimeType === this.nquadsMimeType ||
          metadata.mimeType === this.jsonLdMimeType ||
          metadata.mimeType === this.n3MimeType ||
          metadata.mimeType === this.turtleMimeType ||
          opts.readPath?.endsWith(this.jsonldExt) ) {
        this.logger.debug('Detected RDF file based on mime type or file extension');
        metadata.resource_type = 'rdf';
      } else {
        this.logger.debug('Detected generic file based on mime type or file extension');
        metadata.resource_type = 'file';
      }

      // parse out file parts
      let fileParts = path.parse(filePath);

      // create all directories in the path if they do not exist
      // and get the directory ID of the target directory
      let directoryId = await this.directory.mkdir(fileParts.dir, {dbClient});

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
      if( !fileExists ) {
        this.logger.info('Inserting new file record into CASKFS', context.logContext);
        let primaryDigest = config.digests[0];
        fileId = await dbClient.insertFile(
          directoryId,
          filePath,
          context.stagedFile.digests[primaryDigest],
          metadata,
          context.stagedFile.digests,
          context.stagedFile.size,
          opts.partitionKeys
        );
        context.update({file: await this.metadata(filePath, {dbClient})});
      } else {
        this.logger.info('Updating existing file metadata in CASKFS', context.logContext);
        let resp = await this.patchMetadata(
          context,
          {metadata, partitionKeys: opts.partitionKeys, onlyOnChange: true, dbClient: dbClient}
        );
        context.update({file: await this.metadata(filePath, {dbClient})});
      }

      // if we have rdf data, process it now
      if( metadata.resource_type === 'rdf' ) {
        if( !context?.stagedFile?.hashExists || !fileExists ) {
          // if replacing an existing file, delete old triples first
          this.logger.info('Replacing existing RDF file, deleting old triples', context.logContext);
          await this.rdf.delete(context, {dbClient});

          this.logger.info('Inserting RDF triples for file', context.logContext);
          await this.rdf.insert(context, {dbClient, filepath: context.stagedFile.tmpFile});
        } else {
          this.logger.info('RDF file already exists in CASKFS, skipping RDF processing', context.logContext);
        }
      }

      // finally commit the transaction
      await dbClient.query('COMMIT');
    } catch (err) {
      context.error = err;
      this.logger.error('Error writing file to CASKFS, rolling back transaction',
        {error: err.message, stack: err.stack, ...context.logContext}
      );

      // if any error, rollback the transaction and delete the temp file
      await dbClient.query('ROLLBACK');

      if( context?.stagedFile?.tmpFile ) {
        await this.cas.abortWrite(context.stagedFile.tmpFile);
      }

      await dbClient.end();
      return
    }

    // finalize the write to move the temp file to its final location
    let copied = await this.cas.finalizeWrite(context.stagedFile.tmpFile, context.stagedFile.hashFile);
    this.logger.info(`File write to CASK FS complete: ${filePath}`, {copied}, context.logContext);


    // if we replaced an existing file, and the hash value is no longer referenced, delete it
    // this function will only delete the hash file if no other references exist
    if( copied && opts.softDelete !== true ) {
      this.logger.info(`Checking for unreferenced hash value to delete: ${deletedHashValue}`, context.logContext);
      await this.cas.delete(currentMetadata.hash_value);
    }

    // close the pg client socket connection
    await dbClient.end();

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
   * @param {Boolean} opts.onlyOnChange if true, only update if metadata or partition keys are different than existing. Default: false
   *
   * @returns {Promise<Object>} updated metadata object
   */
  async patchMetadata(context, opts={}) {
    if( !context || !context.file ) {
      throw new Error('FileContext with file path is required');
    }

    let filePath;
    if( typeof context.file === 'string' ) {
      filePath = context.file;
    } else {
      filePath = context.file.filepath;
    }

    if( opts.onlyOnChange ) {
      let currentMetadata = await this.metadata(filePath);
      if( JSON.stringify(currentMetadata.metadata) === JSON.stringify(opts.metadata) &&
          JSON.stringify(currentMetadata.partition_keys) === JSON.stringify(opts.partitionKeys) ) {
        this.logger.debug('No changes to metadata or partition keys, skipping update', context.logContext);
        return {metadata: currentMetadata, updated: false};
      }
    }

    await (opts.dbClient || this.dbClient).updateFileMetadata(filePath, opts);

    return {metadata: this.metadata(filePath), updated: true};
  }

  async metadata(filePath, opts={}) {
    let dbClient = opts.dbClient || this.dbClient;
    let fileParts = path.parse(filePath);

    let res = await dbClient.query(`
      SELECT * FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);

    if( res.rows.length === 0 ) {
      throw new Error(`File not found in CASK FS: ${filePath}`);
    }

    let data = res.rows[0];
    data.fullPath = this.cas.diskPath(data.hash_value);

    if( opts.stats ) {
      res = await dbClient.query(`
        SELECT COUNT(*) AS count FROM ${this.schema}.rdf_link WHERE file_id = $1
      `, [data.file_id]);
      data.rdfLinks = parseInt(res.rows[0].count);

      res = await dbClient.query(`
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
    let res = await this.dbClient.query(`
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

    let dir = await this.directory.get(opts.directory, {dbClient: this.dbClient});
    let childDirs = await this.directory.getChildren(opts.directory, {dbClient: this.dbClient});

    let res = await this.dbClient.query(`
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
    let res = await this.dbClient.query(`
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
   * @param {DatabaseClient} opts.dbClient optional database client to use
   * @param {Boolean} opts.softDelete if true, perform a soft delete removing the file from db but leaving hash
   *                                  file on disk even if no other references exist. Default: false
   * @returns {Promise<Object>} result object with metadata, fileDeleted (boolean), referencesRemaining (int)
   */
  async delete(filePath, opts={}) {
    let dbClient = opts.dbClient || this.dbClient;
    let metadata = await this.metadata(filePath);

    // remove RDF triples first
    this.rdf.delete(metadata.file_id);

    // remove the file record
    await dbClient.query(`
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

    let resp = await this.dbClient.query(`
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

    await this.dbClient.query(`
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
