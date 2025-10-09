import Database from "./lib/database/index.js";
import path from "path";
import config from "./lib/config.js";
import mime from "mime";
import Cas from "./lib/cas.js";
import Rdf from "./lib/rdf.js";
import Directory from "./lib/directory.js";
import acl from "./lib/acl.js";
import { getLogger } from "./lib/logger.js";
import createContext from "./lib/context.js";
import AutoPathBucket from "./lib/auto-path/bucket.js";
import AutoPathPartition from "./lib/auto-path/partition.js";
import { MissingResourceError } from "./lib/errors.js";

class CaskFs {

  constructor(opts={}) {
    this.opts = opts;

    this.dbClient = new Database({
      client: opts.dbClient,
      type: opts.dbType || config.database.client,
      pool: !!opts.dbPool
    });

    // override config options with opts
    if( opts.rootDir ) {
      config.rootDir = opts.rootDir;
    }
    if( opts.postgres ) {
      config.postgres = {...config.postgres, ...opts.postgres};
    }
    if( opts.database ) {
      config.database = {...config.database, ...opts.database};
    }
    if( opts.cloudStorage ) {
      config.cloudStorage = {...config.cloudStorage, ...opts.cloudStorage};
    }

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

    this.authPath = {
      bucket: new AutoPathBucket({dbClient: this.dbClient, schema: this.schema}),
      partition: new AutoPathPartition({dbClient: this.dbClient, schema: this.schema})
    };

    this.acl = acl;
  }

  createContext(obj) {
    return createContext(obj);
  }

  /**
   * @method exists
   * @description Check if a file exists in the CASKFS.
   *
   * @param {String} filePath file path to check
   *
   * @returns {Boolean} true if the file exists, false otherwise
   */
  async exists(filePath, opts={}) {
    await this.canReadFile({...opts, filePath});

    if( opts.file === true) {
      return this.dbClient.fileExists(filePath);
    }
    return this.dbClient.pathExists(filePath);
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
   * @param {String} opts.bucket GCS bucket to use if using GCS storage backend
   * @param {Array} opts.partitionKeys array of partition keys to associate with the file
   *
   * @returns {Object} result object with copied (boolean) and fileId (string)
   */
  async write(context, opts={}) {
    if( !context || !context.file ) {
      throw new Error('FileContext with file path is required');
    }
    let filePath = context.file;

    await this.canWriteFile({...opts, filePath});

    // open single connection to postgres and start a transaction
    let dbClient = new Database({
      type: opts.dbType || config.database.client
    });
    await dbClient.connect();

    let metadata = {};
    let fileExists = false;
    context.primaryDigest = config.digests[0];

    //any operations that fail should rollback the transaction and delete the temp file
    try {
      await dbClient.query('BEGIN');

      fileExists = await dbClient.fileExists(filePath);

      // currently we are opting in to replacing existing files
      if( opts.replace === true && fileExists ) {
        this.logger.info(`Starting replacement of existing file in CASKFS: ${filePath}`, context.logContext);
        context.update({file: await this.metadata(filePath, {dbClient, ignoreAcl: true})});
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

      // build partition keys and bucket from both path and opts
      let autoPathKeys = await this.getAutoPathValues(filePath, opts);
      opts.partitionKeys = autoPathKeys.partitionKeys || null;

      if( this.cas.cloudStorageEnabled ) {
        context.bucket = autoPathKeys.bucket;
        if( !context.bucket ) {
          context.bucket = config.cloudStorage.defaultBucket;
        }
      }

      // write the file record
      if( !fileExists ) {
        this.logger.info('Inserting new file record into CASKFS', context.logContext);
        await dbClient.insertFile({
          directoryId,
          filePath, 
          hash: context.stagedFile.digests[context.primaryDigest], 
          metadata, 
          bucket: context.bucket,
          digests: context.stagedFile.digests,
          size: context.stagedFile.size,
          partitionKeys: opts.partitionKeys
        });
        context.update({file: await this.metadata(filePath, {dbClient, ignoreAcl: true})});
      } else {
        await this.patchMetadata(
          context, 
          {metadata, partitionKeys: opts.partitionKeys, onlyOnChange: true, dbClient: dbClient, ignoreAcl: true}
        );
        context.replacedFile = context.file;
        context.update({file: await this.metadata(filePath, {dbClient, ignoreAcl: true})});
      }

      // now add the layer3 RDF triples for the file
      // if its an RDF file parse and add the file contents triples as well
      if( !context?.stagedFile?.hashExists || !fileExists ) {
        // if replacing an existing file, delete old triples first
        this.logger.info('Replacing existing RDF file, deleting old triples', context.logContext);
        await this.rdf.delete(context, {dbClient, ignoreAcl: true});

        this.logger.info('Inserting RDF triples for file', context.logContext);
        await this.rdf.insert(context, {dbClient, filepath: context.stagedFile.tmpFile, ignoreAcl: true});
      } else {
        this.logger.info('RDF file already exists in CASKFS, skipping RDF processing', context.logContext);
      }      

      // finalize the write to move the temp file to its final location
      context.copied = await this.cas.finalizeWrite(
        context.stagedFile.tmpFile, 
        context.stagedFile.hashFile, 
        {bucket: metadata.bucket, dbClient}
      );

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
      return context;
    }

    this.logger.info(`File write to CASK FS complete: ${filePath}`, {copied: context.copied}, context.logContext);

    // if we replaced an existing file, and the hash value is no longer referenced, delete it
    // this function will only delete the hash file if no other references exist
    if( context.copied && opts.softDelete !== true && context.replacedFile ) {
      this.logger.info(`Checking for unreferenced hash value to delete: ${context.replacedFile.hash_value}`, context.logContext);
      await this.cas.delete(context.replacedFile.hash_value);
    }

    // close the pg client socket connection
    await dbClient.end();

    return context;
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

    let dbClient = opts.dbClient || this.dbClient;

    let filePath;
    if( typeof context.file === 'string' ) {
      filePath = context.file;
    } else {
      filePath = context.file.filepath;
    }

    await this.canWriteFile({...opts, filePath});

    if( opts.onlyOnChange ) {
      let currentMetadata = await this.metadata(filePath, {dbClient, ignoreAcl: true});
      if( JSON.stringify(currentMetadata.metadata) === JSON.stringify(opts.metadata) &&
          JSON.stringify(currentMetadata.partition_keys) === JSON.stringify(opts.partitionKeys) ) {
        this.logger.info('No changes to metadata or partition keys, skipping update', context.logContext);
        return {metadata: currentMetadata, updated: false};
      }
    }

    this.logger.info('Updating existing file metadata in CASKFS', context.logContext);
    await dbClient.updateFileMetadata(filePath, opts);

    return {metadata: this.metadata(filePath, {dbClient, ignoreAcl: true}), updated: true};
  }

  async metadata(filePath, opts={}) {
    let dbClient = opts.dbClient || this.dbClient;

    await this.canReadFile({...opts, filePath});

    let fileParts = path.parse(filePath);

    let res = await dbClient.query(`
      SELECT * FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);

    if( res.rows.length === 0 ) {
      throw new MissingResourceError('File', filePath);
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
    await this.canReadFile({...opts, filePath});

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

  async relationships(filePath, opts={}) {
    await this.canReadFile({...opts, filePath});

    let dbClient = opts.dbClient || this.dbClient;

    if( acl.enabled && opts.user !== undefined && opts.user !== null) {
      opts.userId = acl.getUserId({
        user: opts.user,
        dbClient
      });
    }

    let metadata = await this.metadata(filePath, {dbClient, ignoreAcl: true});
    return this.rdf.relationships(metadata, opts);
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
    if( !opts.directory ) {
      throw new Error('Directory is required');
    }

    if( opts.directory !== '/' && opts.directory.endsWith('/') ) {
      opts.directory = opts.directory.slice(0, -1);
    }

    await this.checkPermissions({
      user: opts.user,
      filePath: opts.directory,
      permission: 'read'
    })

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
    // TODO: add permission check for admin role

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
    await this.canWriteFile({...opts, filePath});

    let dbClient = opts.dbClient || this.dbClient;
    let metadata = await this.metadata(filePath, {dbClient, ignoreAcl: true});

    // remove RDF triples first
    this.rdf.delete({file: metadata});

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

  /**
   * @method ensureRole
   * @description Ensure that a role exists, creating it if it does not.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the insert query
   */
  async ensureRole(opts={}) {
    // TODO: check if user has admin role to create roles

    opts.dbClient = opts.dbClient || this.dbClient;
    await acl.ensureRole(opts);
    return acl.getRole(opts);
  }

  /**
   * @method removeRole
   * @description Remove a role.  Will remove all associated permissions and user associations.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the delete query
   */
  async removeRole(opts={}) {
    // TODO: check if user has admin role to remove roles

    opts.dbClient = opts.dbClient || this.dbClient;
    await acl.removeRole(opts);
    await acl.refreshLookupTable({dbClient});
  }

  /**
   * @method ensureUser
   * @description Ensure that a user exists, creating it if it does not.
   *
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the insert query
   */
  async ensureUser(opts={}) {
    // TODO: check if user has admin role to create users

    opts.dbClient = opts.dbClient || this.dbClient;
    return acl.ensureUser(opts);
  }

  /**
   * @method setUserRole
   * @description Assign a role to a user.
   *
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the insert query
   */
  async setUserRole(opts={}) {
    // TODO: check if user has admin role to set user roles

    return this.runInTransaction(async (dbClient) => {
      opts.dbClient = dbClient;
      await acl.ensureUser(opts);
      await acl.ensureRole(opts);
      await acl.ensureUserRole(opts);

      await acl.refreshLookupTable({dbClient});

      return acl.getRole(opts);
    });
  }

  /**
   * @method removeUserRole
   * @description Remove a role from a user.
   * 
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the delete query
   */
  async removeUserRole(opts={}) {
    // TODO: check if user has admin role to remove user roles

    await this.runInTransaction(async (dbClient) => {
      opts.dbClient = dbClient;
      await acl.removeUserRole(opts);
      await acl.refreshLookupTable({dbClient});

    });
  }

  /**
   * @method setDirectoryPublic
   * @description Set a directory as public or private.  Will create the root directory ACL if needed.
   * 
   * 
   * @param {*} opts 
   */
  async setDirectoryPublic(opts={}) {
    await this.canUpdateDirAcl({
      user: opts.user,
      filePath: opts.directory
    });

    await this.runInTransaction(async (dbClient) => {
      let {rootDirectoryAclId, directoryId} = await acl.ensureRootDirectoryAcl({
        dbClient : dbClient,
        directory : opts.directory,
        isPublic : (opts.permission === 'true')
      });

      await acl.setDirectoryAcl({ 
        dbClient : dbClient,
        rootDirectoryAclId,
        directoryId
      });

      await acl.refreshLookupTable({dbClient});
    });
  }

  /**
   * @method setDirectoryPermission
   * @description Set a permission for a role on a directory.  Will create the root directory ACL if needed.
   * Note, all child directories will inherit the permission unless explicitly overridden.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {String} opts.directory Required. directory path
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   */
  async setDirectoryPermission(opts={}) {
    await this.canUpdateDirAcl({
      user: opts.user,
      filePath: opts.directory
    });

    await this.runInTransaction(async (dbClient) => {
      opts.dbClient = dbClient;
      let {rootDirectoryAclId, directoryId} = await acl.setDirectoryPermission(opts);
      
      await acl.setDirectoryAcl({ 
        dbClient : opts.dbClient,
        rootDirectoryAclId,
        directoryId
      });

      await acl.refreshLookupTable({dbClient});
    });
  }

  /**
   * @method removeDirectoryPermission
   * @description Remove a permission for a role on a directory.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {String} opts.directory Required. directory path
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   */
  async removeDirectoryPermission(opts={}) {
    await this.canUpdateDirAcl({
      user: opts.user,
      filePath: opts.directory
    });

    await this.runInTransaction(async (dbClient) => {
      opts.dbClient = dbClient;
      await acl.removeDirectoryPermission(opts);
      await acl.refreshLookupTable({dbClient});
    });
  }

  /**
   * @method removeDirectoryAcl
   * @description Remove all permissions for a directory ACL.  Child directories will inherit from the nearest
   * ancestor with a directory ACL.
   * 
   * @param {Object} opts
   * @param {String} opts.directory Required. directory path
   * @param {Object} opts.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<void>}
   */
  async removeDirectoryAcl(opts={}) {
    await this.canUpdateDirAcl({
      user: opts.user,
      filePath: opts.directory
    });

    await this.runInTransaction(async (dbClient) => {
      opts.dbClient = dbClient;
      await acl.removeRootDirectoryAcl(opts);
      await acl.refreshLookupTable({dbClient});
    });
  }

  async getDirectoryAcl(opts={}) {
    await this.canUpdateDirAcl({
      user: opts.user,
      filePath: opts.directory
    });

    opts.dbClient = opts.dbClient || this.dbClient;
    return acl.getDirectoryAcl(opts);
  }

  /**
   * @method getCasLocation
   * @description Get the CAS storage location for a given file path.  This will determine the 
   * hash based filepath as well as the bucket if using cloud storage.
   *
   * @param {*} filePath
   * @param {*} opts
   * @returns {Promise<Object>} object with bucket and path
   */
  async getCasLocation(filePath, opts={}) {
    let values = await this.getAutoPathValues(filePath, opts);
    return await this.cas.getLocation(values.bucket);
  }

  /**
   * @method getAutoPathValues
   * @description Get the auto-path values (eg bucket and partition keys) for a given file path.  
   * This will return the bucket and partition keys based on the configured auto-path rules.
   *
   * @param {String} filePath file path to evaluate
   * @param {Object} opts options object
   * @param {String} opts.bucket optional bucket to override auto-path bucket
   * @param {String|Array} opts.partitionKeys optional partition key or array of partition keys to add
   * 
   * @returns {Promise<Object>} object with bucket and partitionKeys array
   */
  async getAutoPathValues(filePath, opts={}) {
    let results = {};
    for( let type in this.authPath ) {
      results[type] = await this.authPath[type].getFromPath(filePath);
    }

    // override bucket if passed in opts
    if( opts.bucket ) {
      results.bucket = opts.bucket;
    } else if( results.bucket.length > 0 ) {
      results.bucket = results.bucket[0]; // take the first bucket if multiple matched
    } else {
      results.bucket = null;
    }

    // combine all partition keys into a single array
    if( results.partition ) {
      if( !opts.partitionKeys ) {
        opts.partitionKeys = [];
      }
      if( !Array.isArray(opts.partitionKeys) ) {
        opts.partitionKeys = [opts.partitionKeys];
      }
      results.partitionKeys = new Set([...opts.partitionKeys, ...results.partition]);
      results.partitionKeys = Array.from(results.partitionKeys);
      delete results.partition;
    }

    return results;
  }

  /**
   * @method runInTransaction
   * @description Open a new database client connection, start a transaction, run the provided function,
   * commit the transaction and close the connection. If any error occurs, rollback the transaction.
   * Function is passed the dbClient as the first argument.  Function can be async.
   * 
   * @param {Function} fn function to run in the transaction, passed the dbClient as the first argument
   * @returns {any} result of the function
   */
  async runInTransaction(fn) {
    let dbClient = await this.openTransaction();
    let result;
    try {
      result = await fn(dbClient);
    } catch(err) {
      await dbClient.query('ROLLBACK');
      throw err;  
    }
    await dbClient.query('COMMIT');
    await dbClient.end();
    return result;
  }

  /**
   * @method openTransaction
   * @description Open a new database client connect, open transaction and return the db client.
   * 
   * @returns {DatabaseClient} database client with open transaction
   */
  async openTransaction() {
    let dbClient = new Database({type: this.opts.dbType || config.database.client});
    await dbClient.connect();
    await dbClient.query('BEGIN');
    return dbClient;
  }

  /**
   * @method canReadFile
   * @description Check if a user has read access to a file.  Returns true or throws an error if not.
   * 
   * @param {Object} opts
   * @param {String} opts.user user name
   * @param {String} opts.filePath file path to check
   * @param {Boolean} opts.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} opts.dbClient optional database client to use
   * @returns 
   */
  async canReadFile(opts={}) {
    opts.dbClient = opts.dbClient || this.dbClient;
    return this.checkPermissions({
      ...opts, 
      permission: 'read', 
      isFile: true
    });
  }

  /**
   * @method canWriteFile
   * @description Check if a user has write access to a file.  Returns true or throws an error if not.
   * 
   * @param {Object} opts
   * @param {String} opts.user user name
   * @param {String} opts.filePath file path to check
   * @param {Boolean} opts.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} opts.dbClient optional database client to use
   * @returns 
   */
  async canWriteFile(opts={}) {
    opts.dbClient = opts.dbClient || this.dbClient;
    return this.checkPermissions({
      ...opts, 
      permission: 'write', 
      isFile: true
    });
  }

  /**
   * @method canUpdateDirAcl
   * @description Check if a user has admin access to update directory ACLs.  Returns true or throws an error if not.
   * 
   * @param {Object} opts 
   * @param {String} opts.user user name
   * @param {Boolean} opts.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} opts.dbClient optional database client to use
   * 
   * @returns 
   */
  async canUpdateDirAcl(opts={}) {
    opts.dbClient = opts.dbClient || this.dbClient;
    return this.checkPermissions({
      ...opts,
      permission: 'admin'
    });
  }

  /**
   * @method checkPermissions
   * @description Check if a user has a specific permission on a file or directory.  
   * Returns true or throws an error if not.  Will skip checks and return true if ACLs are disabled
   * 
   * @param {*} opts 
   * @param {String} opts.user user name
   * @param {String} opts.filePath file path to check
   * @param {String} opts.permission permission to check (read, write, admin)
   * @param {Boolean} opts.isFile if true, check permissions for a file, otherwise for a directory
   * @param {Boolean} opts.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} opts.dbClient optional database client to use
   * @returns 
   */
  async checkPermissions(opts={}) {
    opts.dbClient = opts.dbClient || this.dbClient;

    if( !(await acl.aclLookupRequired(opts)) ) {
      return true;
    }

    let hasAccess = await acl.hasPermission(opts);
    if( !hasAccess ) {
      throw new acl.AclAccessError('Access denied', opts.user, opts.filePath, opts.permission);
    }
    return true;
  }

  close() {
    return this.dbClient.end();
  }
}

export default CaskFs;
