import Database from "./lib/database/index.js";
import path from "path";
import config from "./lib/config.js";
import mime from "mime";
import Cas from "./lib/cas.js";
import Rdf from "./lib/rdf.js";
import Directory from "./lib/directory.js";
import acl from "./lib/acl.js";
import { getLogger } from "./lib/logger.js";
import { createContext, CaskFSContext } from "./lib/context.js";
import AutoPathBucket from "./lib/auto-path/bucket.js";
import AutoPathPartition from "./lib/auto-path/partition.js";
import { MissingResourceError, AclAccessError, DuplicateFileError } from "./lib/errors.js";

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

    this.CaskFSContext = CaskFSContext;

    this.cas = new Cas({dbClient: this.dbClient});
    this.rdf = new Rdf({
      dbClient: this.dbClient,
      cas: this.cas
    });
    this.directory = new Directory({dbClient: this.dbClient});

    this.autoPath = {
      bucket: new AutoPathBucket({dbClient: this.dbClient, schema: this.schema}),
      partition: new AutoPathPartition({dbClient: this.dbClient, schema: this.schema})
    };

    this.acl = acl;
  }

  /**
   * @method exists
   * @description Check if a file exists in the CASKFS.
   *
   * @param {Object|CaskFsContext} context context or object with file property
   * @param {String} context.filePath file path to check
   *
   * @returns {Boolean} true if the file exists, false otherwise
   */
  async exists(context) {
    context = createContext(context, this.dbClient);
    await this.canReadFile(context);

    if( context.file === true) {
      return this.dbClient.fileExists(context.filePath);
    }
    return this.dbClient.pathExists(context.filePath);
  }

  /**
   * @method write
   * @description Write a file to the CASKFS. Can write from a Buffer, Readable Stream, hash value or file path.
   *
   * @param {CaskFSContext|Object} context file context to write to in the CASKFS
   * @param {String} context.readPath path to a file to read and write to the CASKFS
   * @param {Stream} context.readStream readable stream to read and write to the CASKFS
   * @param {String} context.hash existing hash value of a file already in the CASKFS to reference
   * @param {Buffer} context.data data Buffer to write to the CASKFS
   * @param {Boolean} context.replace if true, replace existing file at filePath. Default is false (error if exists)
   * @param {Boolean} context.softDelete if true, perform a soft delete replacing the file in db but leaving hash value
   *                                  on disk even if no other references exist. Default: false
   * @param {String} context.mimeType MIME type of the file being written. Default is auto-detected from file extension.
   * @param {String} context.contentType same as mimeType, for compatibility with other systems
   * @param {String} context.bucket GCS bucket to use if using GCS storage backend
   * @param {Array} context.partitionKeys array of partition keys to associate with the file
   *
   * @returns {Object} result object with copied (boolean) and fileId (string)
   */
  async write(context) {
    context = createContext(context, this.dbClient);

    if( !context.data.filePath ) {
      throw new Error('FileContext with file path is required');
    }
    let filePath = context.data.filePath;

    await this.canWriteFile(context);

    // open single connection to postgres and start a transaction
    let dbClient = new Database({
      type: context.dbType || config.database.client
    });
    await dbClient.connect();

    context.update({
      dbClient,
      metadata: {},
      fileExists: false,
      primaryDigest: config.digests[0],
      dbClient
    });
    let metadata = context.data.metadata;

    //any operations that fail should rollback the transaction and delete the temp file
    try {
      await dbClient.query('BEGIN');

      context.update({
        fileExists: await dbClient.fileExists(filePath)
      });

      // currently we are opting in to replacing existing files
      if( context.data.replace === true && context.data.fileExists ) {
        this.logger.info(`Starting replacement of existing file`, context.logContext);
        context.update({
          file: await this.metadata(context)
        });
      } else if( context.data.replace !== true && context.data.fileExists ) {
        throw new DuplicateFileError(filePath);
      }

      // stage the write to get the hash value and write the temp file
      await this.cas.stageWrite(context);


      // attempt to get mime type
      // if passed in, use that, otherwise try to detect from file extension
      metadata.mimeType = context.data.mimeType || context.data.contentType;
      if( !metadata.mimeType ) {
        this.logger.debug('Attempting to auto-detect mime type, not specified in options', context.logContext);

        // if known RDF extension, set to JSON-LD
        if( filePath.endsWith(this.jsonldExt) || context?.readPath?.endsWith(this.jsonldExt) ) {
          this.logger.debug('Detected JSON-LD file based on file extension', context.logContext);
          metadata.mimeType = this.jsonLdMimeType;
        } else {
          this.logger.debug('Detecting mime type from file extension using mime package', context.logContext);
          // otherwise try to detect from file extension
          metadata.mimeType = mime.getType(filePath);
        }
        // if still not found and we have a readPath, try to detect from that
        if( !metadata.mimeType && context.readPath ) {
          this.logger.debug('Detecting mime type from readPath file extension using mime package', context.logContext);
          metadata.mimeType = mime.getType(context.readPath);
        }
      }

      // determine resource type based on mime type or file extension
      if( metadata.mimeType === this.nquadsMimeType ||
          metadata.mimeType === this.jsonLdMimeType ||
          metadata.mimeType === this.n3MimeType ||
          metadata.mimeType === this.turtleMimeType ||
          context.readPath?.endsWith(this.jsonldExt) ) {
        this.logger.debug('Detected RDF file based on mime type or file extension', context.logContext);
        metadata.resource_type = 'rdf';
      } else {
        this.logger.debug('Detected generic file based on mime type or file extension', context.logContext);
        metadata.resource_type = 'file';
      }

      // parse out file parts
      let fileParts = path.parse(filePath);

      // create all directories in the path if they do not exist
      // and get the directory ID of the target directory
      let directoryId = await this.directory.mkdir(fileParts.dir, {dbClient});

      // build partition keys and bucket from both path and opts
      let autoPathKeys = await this.getAutoPathValues(context);
      context.update({partitionKeys: autoPathKeys.partitionKeys || null});

      if( this.cas.cloudStorageEnabled ) {
        let bucket = autoPathKeys.bucket;
        if( !bucket ) {
          bucket = config.cloudStorage.defaultBucket;
        }
        context.update({bucket});
      }

      // write the file record
      if( !context.data.fileExists ) {
        this.logger.info('Inserting new file record into CASKFS', context.logContext);
        await dbClient.insertFile({
          directoryId,
          filePath, 
          hash: context.data.stagedFile.digests[context.primaryDigest], 
          metadata, 
          bucket: context.data.bucket,
          digests: context.data.stagedFile.digests,
          size: context.data.stagedFile.size,
          partitionKeys: context.data.partitionKeys,
          user: context.data.requestor
        });
        context.update({
          file: await this.metadata(context)
        });
      } else {
        await this.patchMetadata(
          context, 
          {onlyOnChange: true}
        );
        context.update({
          file: await this.metadata(context),
          replacedFile: context.file
        });
      }

      // now add the layer3 RDF triples for the file
      // if its an RDF file parse and add the file contents triples as well
      if( !context?.stagedFile?.hashExists || !fileExists ) {
        // if replacing an existing file, delete old triples first
        this.logger.info('Replacing existing RDF file, deleting old triples', context.logContext);
        await this.rdf.delete(context.data.file, {dbClient, ignoreAcl: true});

        this.logger.info('Inserting RDF triples for file', context.logContext);
        await this.rdf.insert(context.data.file.file_id, 
          {
            dbClient, 
            filepath: context.data.stagedFile.tmpFile
          });
      } else {
        this.logger.info('RDF file already exists, skipping RDF processing', context.logContext);
      }      

      // finalize the write to move the temp file to its final location
      context.copied = await this.cas.finalizeWrite(
        context.data.stagedFile.tmpFile, 
        context.data.stagedFile.hashFile, 
        {bucket: metadata.bucket, dbClient}
      );

      // finally commit the transaction
      await dbClient.query('COMMIT');
    } catch (err) {
      context.error = err;
      this.logger.error('Error writing file, rolling back transaction',
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

    this.logger.info(`File write complete: ${filePath}`, {copied: context.copied}, context.logContext);

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
   * @method sync
   * @description Attempt to optimistically write a list of files to the CaskFS.
   * Each file must have a filePath and hash value. If the hash value does not 
   * exist in the CaskFS, it will be reported in the doesNotExist array.
   *
   * @param {Object|CaskFSContext} context context or object with requestor property
   * @param {String} context.requestor user name of the requestor
   * @param {Object} opts
   * @param {Boolean} opts.replace if true, replace existing file at filePath. Default is false (error if exists)
   * @param {Array} opts.files array of files to sync, each with filePath and hash properties.  Files can have
   *                          optional partitionKeys (array), bucket (string), mimeType (string), metadata (object)
   * @returns {Promise<Object>} result object with success, errors, and doesNotExist arrays
   */
  async sync(context, opts={}) {
    context = createContext(context, this.dbClient);

    let files = opts.files;
    let replace = opts.replace || false;

    if( files.length > config.sync.maxFilesPerBatch ) {
      throw new Error(`Too many files to sync in a single batch, max is ${config.sync.maxFilesPerBatch}`);
    }

    if( !files || !Array.isArray(files) || files.length === 0 ) {
      this.logger.warn('No files to sync', context.logContext);
      return context;
    }

    let success = [];
    let errors = [];
    let doesNotExist = [];

    for( let file of files ) {
      if( !file.filePath || !file.hash ) {
        errors.push({file, error: new Error('filePath and hash are required')});
        continue;
      }

      // set the global replace for sync
      file.replace = replace;
      file.requestor = context.requestor;

      try {
        await this.write(
          createContext(file, context.data.dbClient || this.dbClient)
        );
        success.push(file.filePath);
      } catch (error) {
        if( error instanceof HashNotFoundError ) {
          doesNotExist.push(file.filePath);
        } else {
          errors.push({file, error});
        }
      }
    }

    return {success, errors, doesNotExist};
  }

  /**
   * @method patchMetadata
   * @description Update the metadata and/or partition keys for a file in the CASKFS.
   *
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath file path to update
   * @param {Object} context.metadata metadata object to merge with existing metadata
   * @param {String|Array} context.partitionKeys partition key or array of partition keys to add
   * @param {Object} opts options object
   * @param {Boolean} opts.onlyOnChange if true, only update if metadata or partition keys are different than existing. Default: false
   *
   * @returns {Promise<Object>} updated metadata object
   */
  async patchMetadata(context, opts={}) {
    context = createContext(context, this.dbClient);

    if( !context.data.filePath ) {
      throw new Error('Context with filePath is required');
    }

    let dbClient = context.data.dbClient || this.dbClient;
    let filePath = context.data.filePath;

    await this.canWriteFile(context);

    if( opts.onlyOnChange ) {
      let currentMetadata = await this.metadata(context);
      if( JSON.stringify(currentMetadata.metadata) === JSON.stringify(context.data.metadata) &&
          JSON.stringify(currentMetadata.partition_keys) === JSON.stringify(context.data.partitionKeys) ) {
        this.logger.info('No changes to metadata or partition keys, skipping update', context.logContext);
        return {metadata: currentMetadata, updated: false};
      }
    }

    this.logger.info('Updating existing file metadata', context.logContext);
    await dbClient.updateFileMetadata(filePath, context.data);

    return {
      metadata: await this.metadata(context),
      updated: true
    };
  }

  /**
   * @method metadata
   * @description Get the metadata for a file in the CaskFS.
   *
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath file path to get metadata for
   * @param {Object} context.requestor user name of the requestor
   * @param {Boolean} context.stats if true, include additional stats (rdfLinks, rdfNodes) in the metadata
   *
   * @returns {Promise<Object>} metadata object
   */
  async metadata(context) {
    context = createContext(context, this.dbClient);
    let dbClient = context.data.dbClient;

    await this.canReadFile(context);

    let fileParts = path.parse(context.data.filePath);

    let res = await dbClient.query(`
      SELECT * FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);

    if( res.rows.length === 0 ) {
      throw new MissingResourceError('File', filePath);
    }

    let data = res.rows[0];
    data.fullPath = this.cas.diskPath(data.hash_value);

    if( context.stats ) {
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
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath file path to read
   * @param {Object} context.requestor user name of the requestor
   * @param {Object} opts options object
   * @param {Boolean} opts.stream if true, return a stream. If false, return a Promise to content. Default: false
   * @param {String} opts.encoding encoding to use when reading the file. Default: null (buffer)
   *
   * @returns {Promise<Buffer>|Stream} file contents as a Buffer or Stream
   */
  async read(context, opts={}) {
    context = createContext(context, this.dbClient);
    await this.canReadFile(context);

    let fileParts = path.parse(context.data.filePath);
    let res = await this.dbClient.query(`
      SELECT hash_value FROM ${this.schema}.file_view WHERE directory = $1 AND filename = $2
    `, [fileParts.dir, fileParts.base]);

    if( res.rows.length === 0 ) {
      throw new MissingResourceError('File', context.data.filePath);
    }

    let hash = res.rows[0].hash_value;

    return this.cas.read(hash, opts);
  }

  /**
   * @method relationships
   * @description Get the RDF relationships for a file in the CaskFS.
   * 
   * @param {Object|CaskFSContext} context
   * @param {String} context.filePath file path to get relationships for
   * @param {Object} context.requestor user name of the requestor
   *  
   * @returns 
   */
  async relationships(context={}) {
    context = createContext(context, this.dbClient);

    await this.canReadFile(context);

    let dbClient = context.data.dbClient;

    if( acl.enabled && context.data.requestor !== undefined && context.data.requestor !== null ) {
      context.data.userId = await acl.getUserId({
        user: context.data.requestor,
        dbClient
      });
    }

    let metadata = await this.metadata(context);
    return this.rdf.relationships(metadata, opts);
  }

  /**
   * @method ls
   * @description List files in the CASKFS. Can filter by directory, partition keys, or hash value.
   *
   * @param {Object|CaskFSContext} context query options
   * @param {String} context.directory directory to list
   *
   * @returns {Object} result object with query and files array
   */
  async ls(context={}) {
    context = createContext(context, this.dbClient);

    if( !context.data.directory ) {
      throw new Error('Directory is required');
    }

    if( context.data.directory !== '/' && context.data.directory.endsWith('/') ) {
      context.update({
        directory: context.data.directory.slice(0, -1)
      });
    }

    await this.checkPermissions(context, {permission: 'read'})

    let dir = await this.directory.get(context.data.directory, {dbClient: context.data.dbClient});

    // TODO: this needs to check if user can read the directory
    let childDirs = await this.directory.getChildren(context.data.directory, {dbClient: context.data.dbClient});

    let res = await context.data.dbClient.query(`
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

  async stats(opts={}) {
    context = createContext(opts, this.dbClient);
    await this.allowAdminAction(context);

    context.setDbClientIfNotSet(this.dbClient);
    let res = await context.data.dbClient.query(`
      SELECT * from ${this.schema}.stats
    `);
    return res.rows[0];
  }

  /**
   * @method delete
   * @description Delete a file from the CASKFS. Removes the file record, partition keys, RDF triples, and
   * then calls the CAS delete method to remove the file from storage if no other references exist.
   *
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath file path to delete
   * @param {DatabaseClient} context.dbClient optional database client to use
   * @param {Objects} opts options object
   * @param {Boolean} opts.softDelete if true, perform a soft delete removing the file from db but leaving hash
   *                                  file on disk even if no other references exist. Default: false
   * @returns {Promise<Object>} result object with metadata, fileDeleted (boolean), referencesRemaining (int)
   */
  async delete(context={}, opts={}) {
    context = createContext(context, this.dbClient);

    await this.canWriteFile(context);


    let metadata = await this.metadata(context);

    // remove RDF triples first
    this.rdf.delete(metadata);

    // remove the file record
    await context.data.dbClient.query(`
      DELETE FROM ${this.schema}.file WHERE file_id = $1
    `, [metadata.file_id]);

    opts.dbClient = context.data.dbClient;
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
   * @param {Object|CaskFSContext} context
   * @param {String} context.role Required. role name
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the insert query
   */
  async ensureRole(context={}) {
    context = createContext(context, this.dbClient);
    await this.allowAdminAction(context);

    await acl.ensureRole({
      role: context.data.role,
      dbClient: context.dbClient || this.dbClient
    });
  }

  /**
   * @method removeRole
   * @description Remove a role.  Will remove all associated permissions and user associations.
   *
   * @param {Object} context
   * @param {String} context.role Required. role name
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the delete query
   */
  async removeRole(context={}) {
    context = createContext(context, this.dbClient);
    await this.allowAdminAction(context);

    return this.runInTransaction(async (dbClient) => {
      await acl.removeRole({
        role: context.data.role,
        dbClient
      });
      await acl.refreshLookupTable({dbClient});
    });
  }

  /**
   * @method ensureUser
   * @description Ensure that a user exists, creating it if it does not.
   *
   * @param {Object} context
   * @param {String} context.user Required. user name
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the insert query
   */
  async ensureUser(context={}) {
    context = createContext(context, this.dbClient);
    await this.allowAdminAction(context);

    return acl.ensureUser({
      user: context.data.user,
      dbClient: context.dbClient || this.dbClient
    });
  }

  /**
   * @method ensureUserRoles
   * @description Ensure that a set of user/role associations exist, 
   * creating users and roles as needed. userRoles should have the format:
   * {
   *  "user1": ["role1", "role2"],
   *  "user2": ["role2"]
   * }
   *
   * @param {Object|CaskFSContext} context
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @param {String} config.requestor user name of the requestor
   * @param {Object} userRoles
   * 
   * @returns {Promise<void>}
   */
  async ensureUserRoles(context={}, userRoles={}) {
    context = createContext(context, this.dbClient);
    await this.allowAdminAction(context);

    for (const user in userRoles) {
      for (const role of userRoles[user]) {
        await acl.ensureUserRole({
          user,
          role,
          dbClient: context.dbClient || this.dbClient
        });
      }
    }
  }

  /**
   * @method setUserRole
   * @description Assign a role to a user.
   *
   * @param {Object|CaskFSContext} context context or object with user and role properties
   * @param {String} context.user Required. user name
   * @param {String} context.role Required. role name
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the insert query
   */
  async setUserRole(context={}) {
    context = createContext(context, this.dbClient);
    await this.allowAdminAction(context);

    return this.runInTransaction(async (dbClient) => {
      let opts = {
        user: context.data.user,
        role: context.data.role,
        dbClient
      }

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
   * @param {Object|CaskFSContext} context context or object with user and role properties
   * @param {String} context.user Required. user name
   * @param {String} context.role Required. role name
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<Object>} result of the delete query
   */
  async removeUserRole(context={}) {
    context = createContext(context, this.dbClient);

    await this.allowAdminAction(context);

    await this.runInTransaction(async (dbClient) => {
      await acl.removeUserRole({
        user: context.user,
      });
      await acl.refreshLookupTable({dbClient});

    });
  }

  /**
   * @method setDirectoryPublic
   * @description Set a directory as public or private.  Will create the root directory ACL if needed.
   * 
   * 
   * @param {Object|CaskFSContext} context context or object with directory property
   * @param {String} context.directory Required. directory path
   * @param {Boolean|String} context.permission Required. true/false or 'true'/'false' to set public/private
   * @param {String} context.requestor user name of the requestor 
   */
  async setDirectoryPublic(context={}) {

    context = createContext(context, this.dbClient);
    await this.canUpdateDirAcl(context);

    await this.runInTransaction(async (dbClient) => {
      let {rootDirectoryAclId, directoryId} = await acl.ensureRootDirectoryAcl({
        dbClient : dbClient,
        directory : context.data.directory,
        isPublic : (context.data.permission === 'true') || context.data.permission === true
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
   * @param {Object|CaskFSContext} context
   * @param {String} context.role Required. role name
   * @param {String} context.directory Required. directory path
   * @param {String} context.permission Required. permission to set, one of 'read', 'write', 'admin'
   * @param {String} context.requestor user name of the requestor
   */
  async setDirectoryPermission(context={}) {
    context = createContext(context, this.dbClient);
    await this.canUpdateDirAcl(context);

    await this.runInTransaction(async (dbClient) => {
      let {rootDirectoryAclId, directoryId} = await acl.setDirectoryPermission({
        dbClient,
        role: context.data.role,
        directory: context.data.directory,
        permission: context.data.permission
      });

      await acl.setDirectoryAcl({
        dbClient,
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
   * @param {Object|CaskFSContext} context context or object with directory property
   * @param {String} context.role Required. role name
   * @param {String} context.directory Required. directory path
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   */
  async removeDirectoryPermission(context={}) {
    context = createContext(context, this.dbClient);

    await this.canUpdateDirAcl(context);

    await this.runInTransaction(async (dbClient) => {
      await acl.removeDirectoryPermission({
        dbClient,
        role: context.data.role,
        directory: context.data.directory,
        permission: context.data.permission
      });
      await acl.refreshLookupTable({dbClient});
    });
  }

  /**
   * @method removeDirectoryAcl
   * @description Remove all permissions for a directory ACL.  Child directories will inherit from the nearest
   * ancestor with a directory ACL.
   * 
   * @param {Object|CaskFSContext} context context or object with directory property
   * @param {String} context.directory Required. directory path
   * @param {Object} context.dbClient Optional. database client instance, defaults to instance dbClient
   * @returns {Promise<void>}
   */
  async removeDirectoryAcl(context={}) {
    context = createContext(context, this.dbClient);

    await this.canUpdateDirAcl(context);

    await this.runInTransaction(async (dbClient) => {
      await acl.removeRootDirectoryAcl({
        dbClient, directory: context.data.directory
      });
      await acl.refreshLookupTable({dbClient});
    });
  }

  /**
   * @method getDirectoryAcl
   * @description Get the directory ACL for a given directory, including inherited permissions.
   *
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath directory path to get ACL for
   * @param {String} context.requestor user name of the requestor
   * @param {Object} context.dbClient optional database client to use
   * @returns {Promise<Object>} directory ACL object
   */
  async getDirectoryAcl(context={}) {
    context = createContext(context, this.dbClient);

    await this.canUpdateDirAcl(context);

    return acl.getDirectoryAcl({
      dbClient: context.data.dbClient || this.dbClient,
      directory: context.data.filePath
    });
  }

  /**
   * @method getCasLocation
   * @description Get the CAS storage location for a given file path.  This will determine the 
   * hash based filepath as well as the bucket if using cloud storage.
   *
   * @param {CaskFSContext} context
   * @param {String} context.data.filePath file path to evaluate
   * @param {String} context.data.bucket optional bucket to override auto-path bucket
   * @param {String} context.data.partitionKeys optional partition key or array of partition keys to add
   * @returns {Promise<Object>} object with bucket and path
   */
  async getCasLocation(context={}) {
    let values = await this.getAutoPathValues(context);
    return await this.cas.getLocation(values.bucket);
  }

  /**
   * @method getAutoPathValues
   * @description Get the auto-path values (eg bucket and partition keys) for a given file path.  
   * This will return the bucket and partition keys based on the configured auto-path rules.
   *
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath file path to evaluate
   * @param {String} context.bucket optional bucket to override auto-path bucket
   * @param {String|Array} context.partitionKeys optional partition key or array of partition keys to add
   *
   * @returns {Promise<Object>} object with bucket and partitionKeys array
   */
  async getAutoPathValues(context={}) {
    context = createContext(context, this.dbClient);

    let results = {};
    for( let type in this.autoPath ) {
      results[type] = await this.autoPath[type].getFromPath(context.data.filePath);
    }

    // override bucket if passed in context
    if( context.data.bucket ) {
      results.bucket = context.data.bucket;
    } else if( results.bucket.length > 0 ) {
      results.bucket = results.bucket[0]; // take the first bucket if multiple matched
    } else {
      results.bucket = null;
    }

    // combine all partition keys into a single array
    if( results.partition ) {
      if( !context.data.partitionKeys ) {
        context.data.partitionKeys = [];
      }
      if( !Array.isArray(context.data.partitionKeys) ) {
        context.data.partitionKeys = [context.data.partitionKeys];
      }
      results.partitionKeys = new Set([...context.data.partitionKeys, ...results.partition]);
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
   * @method allowAdminAction
   * @description Check if the requestor has admin permissions.  Returns true if ACLs are disabled,
   * the ignoreAcl flag is set, or the user has an admin role.  Otherwise returns false.
   * 
   * @param {Object|CaskFSContext} context 
   * @param {String} context.requestor requestor user name
   * @param {Boolean} context.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} context.dbClient optional database client to use
   * @returns 
   */
  async allowAdminAction(context) {
    context.setDbClientIfNotSet(this.dbClient);

    // this function runs proper checks to see if:
    // 1. ACLs are enabled
    // 2. if the ignoreAcl flag is set
    // 3. if the user has an admin role
    return (! await acl.aclLookupRequired({
      requestor: context.data.requestor,
      dbClient: context.data.dbClient,
      ignoreAcl: context.data.ignoreAcl || false
    }));
  }

  /**
   * @method canReadFile
   * @description Check if a user has read access to a file.  Returns true or throws an error if not.
   * 
   * @param {Object} context
   * @param {String} context.data.requestor requestor user name
   * @param {String} context.data.filePath file path to check
   * @param {Boolean} context.data.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} context.data.dbClient optional database client to use
   * @returns 
   */
  async canReadFile(context={}) {
    context.setDbClientIfNotSet(this.dbClient);
    return this.checkPermissions(
      context,
      {
        permission: 'read',
        isFile: true
      }
    );
  }

  /**
   * @method canWriteFile
   * @description Check if a user has write access to a file.  Returns true or throws an error if not.
   * 
   * @param {Object} context
   * @param {String} context.data.requestor requestor user name
   * @param {String} context.data.filePath file path to check
   * @param {Boolean} context.data.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} context.data.dbClient optional database client to use
   * @returns
   */
  async canWriteFile(context={}) {
    context.setDbClientIfNotSet(this.dbClient);
    return this.checkPermissions(
      context,
      {
        permission: 'write',
        isFile: true
      }
    );
  }

  /**
   * @method canUpdateDirAcl
   * @description Check if a user has admin access to update directory ACLs.  Returns true or throws an error if not.
   * 
   * @param {CaskFsContext} context
   * @param {String} context.data.requestor requestor user name
   * @param {Boolean} context.data.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} context.data.dbClient optional database client to use
   * 
   * @returns 
   */
  async canUpdateDirAcl(context={}) {
    context.setDbClientIfNotSet(this.dbClient);
    return this.checkPermissions(
      context, {permission: 'admin'}
    );
  }

  /**
   * @method checkPermissions
   * @description Check if a user has a specific permission on a file or directory.  
   * Returns true or throws an error if not.  Will skip checks and return true if ACLs are disabled
   * 
   * @param {CaskFSContext} context
   * @param {String} context.data context object with properties
   * @param {String} context.data.requestor requestor user name
   * @param {String} context.data.filePath file path to check
   * @param {Boolean} context.data.ignoreAcl if true, skip ACL checks and always return true
   * @param {DatabaseClient} context.data.dbClient optional database client to use
   * @param {Object} opts 
   * @param {String} opts.permission permission to check (read, write, admin)
   * @param {Boolean} opts.isFile if true, check permissions for a file, otherwise for a directory
   * @param {Boolean} opts.noContextUpdate if true, do not update the context ignoreAcl property
   * @returns 
   */
  async checkPermissions(context, opts={}) {
    let dbClient = opts.dbClient || this.dbClient;

    let aclCheckOpts = {
      ignoreAcl: context.data.ignoreAcl || false,
      requestor: context.data.requestor,
      filePath: context.data.filePath,
      permission: opts.permission,
      isFile: opts.isFile || false,
      dbClient: dbClient
    };

    if( !(await acl.aclLookupRequired(aclCheckOpts)) ) {
      if( opts.noContextUpdate !== true ) {
        context.update({ignoreAcl: true});
      }
      return true;
    }

    let hasAccess = await acl.hasPermission(aclCheckOpts);
    if( !hasAccess ) {
      throw new AclAccessError('Access denied', aclCheckOpts.requestor, aclCheckOpts.filePath, aclCheckOpts.permission);
    }

    if( opts.noContextUpdate !== true ) {
      context.update({ignoreAcl: false});
    }
    return true;
  }

  async powerWash() {
    if( !config.powerWashEnabled ) {
      throw new Error('Powerwash is not enabled in the configuration');
    }
    await this.cas.powerWash();
    await this.dbClient.powerWash();
    await this.dbClient.init();
  }


  /**
   * @method close
   * @description Close the database client connection.
   * 
   * @returns 
   */
  close() {
    return this.dbClient.end();
  }
}

export default CaskFs;
