import config from './config.js';
import fs from 'fs';
import fsp from 'fs/promises';
import {v4 as uuidV4} from "uuid";
import path from 'path';
import crypto from "crypto";
import Database from './database/index.js';
import { getLogger } from './logger.js';
import GCSStorage from './storage/gcs.js';
import FSStorage from './storage/fs.js';
import { HashNotFoundError } from './errors.js';

class Cas {

  constructor(opts={}) {
    this.cloudStorageEnabled = opts.cloudStorageEnabled || config.cloudStorage.enabled;
    this.dbClient = opts.dbClient || new Database();
    this.logger = getLogger('cas');
    this.rootSubPath = 'cas';
    this.pathPrefix = '';
  }

  init() {
    if( this.storage ) {
      return this.storage;
    }

    if( this.cloudStorageEnabled ) {
      this.storage = new GCSStorage({ dbClient: this.dbClient });
      this.pathPrefix = 'gs:/';
      return this.storage.init();
    }

    this.storage = new FSStorage();
    return Promise.resolve();
  }

  async stageWrite(context) {
    let digests;

    // create a temp file to write the stream to
    let tmpFile;
    if( !context.data.hash ) {
      tmpFile = path.join(config.rootDir, 'tmp', uuidV4());
      this.logger.debug('Staging write to temp file', tmpFile, context.logSignal);

      // ensure the directory exists
      await fsp.mkdir(path.dirname(tmpFile), {recursive: true});
    }

    // stage by write tmp file and calculate digests
    if( context.data.readStream ) {
      this.logger.debug('Staging write from readStream', context.logSignal);
      digests = await this.writeStream(tmpFile, context.data.readStream);
    } else if( context.data.readPath ) {
      this.logger.debug('Staging write from readPath', context.logSignal);
      digests = await this.writePath(tmpFile, context.data);
      // writePath skips creating tmpFile when the hash already exists in CAS;
      // nullify so the stat below falls back to the existing hash file.
      if( tmpFile && !fs.existsSync(tmpFile) ) tmpFile = null;
    } else if( context.data.data ) {
      this.logger.debug('Staging write from data', context.logSignal);
      digests = await this.writeData(tmpFile, context.data);
    } else if( context.data.hash ) {
      this.logger.debug('Staging write from existing hash', context.logSignal);
      digests = await this.writeHash(context.data);
    } else {
      throw new Error('No input specified for write operation');
    }

    // get file last modified time, created time and size
    // if the hash exists, we can use the cas file otherwise use the tmp file
    let primaryHash = config.digests[0];
    let hashFile = this.diskPath(digests[primaryHash]);

    // get file stats
    let stats = await fsp.stat(tmpFile || hashFile);

    let stagedFile = { 
      hash_value: digests[primaryHash],
      digests, 
      tmpFile,
      size: stats.size,
      hashFile
    };

    context.update({ stagedFile });
  }

  


  /**
   * @method quadPath
   * @description Return the filesystem or GCS path for the .nq quad file associated with a hash.
   *
   * @param {String} hash hash value
   * @returns {String} path to the .nq file
   */
  quadPath(hash) {
    return this.diskPath(hash) + '.nq';
  }

  /**
   * @method writeQuads
   * @description Write an N-Quads string to the .nq file for the given hash.
   *
   * @param {String} hash hash value
   * @param {String} nquads N-Quads string to write
   * @param {Object} opts options passed through to the storage backend (e.g. opts.bucket for GCS)
   * @returns {Promise}
   */
  async writeQuads(hash, nquads, opts={}) {
    await this.init();
    const quadFile = this.quadPath(hash);
    await this.storage.mkdir(path.dirname(quadFile), {recursive: true});
    await this.storage.writeFile(quadFile, nquads, opts);
  }

  /**
   * @method readQuads
   * @description Read the N-Quads string from the .nq file for the given hash.
   *
   * @param {String} hash hash value
   * @param {Object} opts options object
   * @param {Boolean} opts.stream if true, return a readable stream instead of a string
   * @param {String} opts.bucket GCS bucket override (auto-resolved from DB if not provided)
   * @param {Object} opts.dbClient optional postgres client for bucket resolution
   * @returns {Promise<String>|ReadableStream}
   */
  async readQuads(hash, opts={}) {
    await this.init();
    const quadFile = this.quadPath(hash);

    let readOpts = { ...opts };
    if( this.cloudStorageEnabled && !readOpts.bucket ) {
      readOpts.bucket = await this._getHashBucket(hash, opts.dbClient);
    }

    if( !await this.storage.exists(quadFile, readOpts) ) {
      throw new Error(`Quad file not found for hash ${hash}: ${quadFile}`);
    }

    if( opts.stream ) {
      return this.storage.createReadStream(quadFile, readOpts);
    }
    return this.storage.readFile(quadFile, { ...readOpts, encoding: 'utf8' });
  }

  /**
   * @method quadExists
   * @description Check whether the .nq quad file exists for the given hash.
   *
   * @param {String} hash hash value
   * @param {Object} opts options object
   * @param {String} opts.bucket GCS bucket override (auto-resolved from DB if not provided)
   * @param {Object} opts.dbClient optional postgres client for bucket resolution
   * @returns {Promise<Boolean>}
   */
  async quadExists(hash, opts={}) {
    await this.init();
    const quadFile = this.quadPath(hash);

    let existsOpts = { ...opts };
    if( this.cloudStorageEnabled && !existsOpts.bucket ) {
      existsOpts.bucket = await this._getHashBucket(hash, opts.dbClient);
    }

    return this.storage.exists(quadFile, existsOpts);
  }

  /**
   * @method finalizeWrite
   * @description Finalize a write operation by moving the temp file to its final location
   * if a file with the same hash does not already exist.  If nquads are provided, the .nq
   * companion file is written whenever it does not yet exist (regardless of whether the hash
   * file itself is new).
   *
   * @param {String} tmpFile path to the temp file
   * @param {String} hashFile path to the final file location based on hash
   * @param {String} nquads N-Quads string for linked data files, or null for binary files
   * @param {Object} opts copy options, mostly for bucket storage backends.
   *
   * @returns {Promise<Boolean>} resolves with true if the file was copied, false if it already existed
   */
  async finalizeWrite(tmpFile, hashFile, nquads, opts={}) {
    let copied = false;
    await this.init();

    const hashValue = path.basename(hashFile);

    if( !await this.storage.exists(hashFile, opts) ) {
      copied = true;
      await this.storage.mkdir(path.dirname(hashFile), {recursive: true});
      await this.storage.copyFile(tmpFile, hashFile, opts);

      if( nquads ) {
        await this.writeQuads(hashValue, nquads, opts);
      }
    } else if( nquads && !await this.quadExists(hashValue, opts) ) {
      await this.writeQuads(hashValue, nquads, opts);
    }

    if( fs.existsSync(tmpFile) ) {
      await fsp.unlink(tmpFile);
    }

    return copied;
  }

  async abortWrite(tmpFile) {
    if( fs.existsSync(tmpFile) ) {
      await fsp.unlink(tmpFile);
    }
  }

  /**
   * @method writeStream
   * @description Write a readable stream to a file while calculating digests.
   * 
   * @param {String} filePath path to the file to write
   * @param {ReadableStream} stream readable stream to write
   * @returns {Promise} resolves with the calculated digests
   */
  writeStream(filePath, stream) {
    let digests = {};
    for( let algo of config.digests ) {
      digests[algo] = crypto.createHash(algo);
    }

    stream.on('data', (chunk) => {
      for( let algo of config.digests ) {
        digests[algo].update(chunk);
      }
    });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      stream.pipe(writeStream);
      writeStream.on('finish', () => {
        for( let algo of config.digests ) {
          digests[algo] = digests[algo].digest('hex');
        }
        resolve(digests);
      });
      writeStream.on('error', (err) => {
        reject(err);
      });
    });
  }

  async writePath(tmpFile, opts) {
    if( !path.isAbsolute(opts.readPath) ) {
      throw new Error('readPath must be an absolute path: ' + opts.readPath);
    }
    if( !fs.existsSync(opts.readPath) ) {
      throw new Error(`readPath does not exist: ${opts.readPath}`);
    }

    let digests = await this._getFileHash(opts.readPath);

    let primary = config.digests[0];
    let primaryHash = digests[primary];

    // don't copy if the file already exists
    if( await fs.existsSync(this.diskPath(primaryHash)) ) {
      return digests;
    }
    
    await fsp.copyFile(opts.readPath, tmpFile);

    return digests;
  }

  async writeData(tmpFile, opts) {
    await fsp.writeFile(tmpFile, opts.data);
    return this._getFileHash(tmpFile);
  }

  async writeHash(opts) {
    await this.init();

    // just using an existing hash, so no file operations needed
    let fullPath = this.diskPath(opts.hash);

    // just ensure the file exists
    if( !await this.storage.exists(fullPath) ) {
      throw new HashNotFoundError(`File with hash ${opts.hash} does not exist in CASKFS`);
    }

    // JM - should we just do a db lookup, or recalculate all hashes
    //      in case the digest algorithms have changed?
    return this._getFileHash(fullPath);
  }

  /**
   * @method read
   * @description Return the file contents for the given hash value.
   *
   * @param {String} hash
   * @param {Object} opts options object
   * @param {Boolean} opts.stream if true, return a readable stream instead of a buffer
   * @param {String} opts.encoding if specified, encode the file contents with the given encoding (e.g. 'utf8')
   * @param {Number} [opts.start] - First byte offset for partial reads (inclusive). Only applies when stream=true.
   * @param {Number} [opts.end] - Last byte offset for partial reads (inclusive). Only applies when stream=true.
   *
   * @returns {Promise<Buffer>|ReadableStream} resolves with a buffer or a readable stream
   */
  async read(hash, opts={}) {
    await this.init();

    const fullPath = this.diskPath(hash);

    if( !await this.storage.exists(fullPath) ) {
      throw new Error(`File with hash ${hash} does not exist in CASK FS`);
    }

    if( opts.stream === true ) {
      return this.storage.createReadStream(fullPath, {
        encoding: opts.encoding || null,
        start: opts.start,
        end: opts.end,
      });
    }

    return this.storage.readFile(fullPath, {encoding: opts.encoding || null});
  }

  async getLocation(bucket) {
    await this.init();
    if( this.storage instanceof FSStorage ) {
      return 'fs';
    }
    if( this.storage instanceof GCSStorage ) {
      return `gs://${bucket || config.cloudStorage.defaultBucket}`;
    }
  }

  /**
   * @method delete
   * @description Delete a file from the CASKFS and the underlying storage if no other references exist.
   * 
   * @param {String} hash hash value of the file to delete
   * @param {Object} opts options object
   * @param {dbClient} opts.dbClient optional postgres client to use
   * @param {Boolean} opts.softDelete if true, perform a soft delete (mark as deleted) instead of hard delete
   * 
   * @returns {Promise}
   */
  async delete(hash, opts={}) {
    await this.init();

    let dbClient = opts.dbClient || this.dbClient;

    // check if any other files reference this hash
    let res = await dbClient.query(`
      SELECT COUNT(*) AS count
      FROM ${config.database.schema}.file f
      JOIN ${config.database.schema}.hash h ON h.hash_id = f.hash_id
      WHERE h.value = $1
    `, [hash]);

    if( opts.softDelete === true ) {
      return {
        fileDeleted: false,
        softDelete: true,
        referencesRemaining: parseInt(res.rows[0].count)
      }
    }

    let fileDeleted = false;
    if( res.rows[0].count === '0' ) {
      let fullPath = this.diskPath(hash);

      if( !opts.silent ) {
        this.logger.info(`Deleting unreferenced file with hash ${hash} at path ${fullPath}`);
      }

      let deleteOpts = {};
      if( this.cloudStorageEnabled ) {
        deleteOpts.bucket = await this._getHashBucket(hash, dbClient);
      }

      if( await this.storage.exists(fullPath, deleteOpts) ) {
        await this.storage.unlink(fullPath, deleteOpts);
      }

      const quadFile = this.quadPath(hash);
      if( await this.storage.exists(quadFile, deleteOpts) ) {
        await this.storage.unlink(quadFile, deleteOpts);
      }

      await dbClient.query(`
        DELETE FROM ${config.database.schema}.hash WHERE value = $1
      `, [hash]);

      fileDeleted = true;
    }

    return {
      fileDeleted,
      referencesRemaining: parseInt(res.rows[0].count)
    }
  }

  /**
   * @method exists
   * @description Check if a file exists in the CASKFS.
   * 
   * @param {String} hash - The hash value of the file to check.
   * 
   * @returns {Boolean} - True if the file exists, false otherwise.
   */
  exists(hash) {
    return fs.existsSync(this.diskPath(hash));
  }

  diskPath(hash) {
    if( this.cloudStorageEnabled ) {
      return this._getHashFilePath(hash);
    } 
    return path.join(config.rootDir, this.rootSubPath, this._getHashFilePath(hash));
  }

  /**
   * @method powerWash
   * @description Remove all files from the CaskFs root directory. This is a destructive operation and should be used with caution.
   */
  powerWash() {
    if( this.cloudStorageEnabled ) {
      throw new Error('Powerwash is not supported for cloud storage backends');
    }
    let dir = path.resolve(config.rootDir);
    this.logger.warn('Powerwashing CaskFs root directory:', dir);
    
    // Remove contents of directory but keep the directory itself
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      fs.rmSync(itemPath, { recursive: true, force: true });
    }
    this.logger.warn('CaskFs root directory contents removed from:', dir);
  }

  /**
   * @method getUnusedHashCount
   * @description Get the count of unused hashes in the database. This can be used to monitor for 
   * orphaned files via soft deletes that may need to be cleaned up.
   * 
   * @returns {Promise<Number>} resolves with the count of unused hashes
   */
  async getUnusedHashCount() {
    let res = await this.dbClient.query(`SELECT COUNT(*) AS count FROM ${config.database.schema}.unused_hashes`);
    return parseInt(res.rows[0].count);
  }

  /**
   * @method deleteUnusedHashes
   * @description Delete unused hashes from the database and their corresponding files from storage. 
   * This can be used to clean up orphaned files via soft deletes. You can specify a list of hashes 
   * to delete or a limit for how many to delete in batch.
   * 
   * 
   * @param {Object} opts options object
   * @param {dbClient} opts.dbClient optional postgres client to use
   * @param {Array<String>} opts.hashList list of hash values to delete, if not provided will delete based on limit
   * @param {Number} opts.limit number of unused hashes to delete if hashList is not provided
   * 
   * @returns {Promise}
   */
  async deleteUnusedHashes(opts={}) {
    let dbClient = opts.dbClient || this.dbClient;
    let limit = opts.limit || 100;
    let hashList = opts.hashList || [];

    if( !hashList && !limit ) {
      throw new Error('Either hashList or limit must be provided to deleteUnusedHashes');
    }

    if( hashList && hashList.length > 0 ) {
      await dbClient.query(`
        DELETE FROM ${config.database.schema}.unused_hashes WHERE value = ANY($1)
      `, [hashList]);
    } else if( limit ) {
      let resp = await dbClient.query(`
        WITH to_delete AS (
          SELECT value
          FROM ${config.database.schema}.unused_hashes
          LIMIT $1
        )
        DELETE FROM ${config.database.schema}.hash u
        USING to_delete d
        WHERE u.value = d.value
        RETURNING u.value
      `, [limit]);
      hashList = resp.rows.map(row => row.value);
    }

    for( let hash of hashList ) {
      await this.delete(hash, { 
        dbClient, 
        softDelete: false,
        silent: true
      });
    }

    return hashList;
  }

  /**
   * @method _hashData
   * @description Calculate the hash values for a given data buffer.
   * 
   * @param {Buffer} data 
   * @returns {Object} object containing the digests for each algorithm
   */
  _hashData(data) {
    let digests = {};

    for( let algo of config.digests ) {
      let hash = crypto.createHash(algo);
      hash.update(data);
      digests[algo] = hash.digest('hex');
    }

    return digests;
  }

  /**
   * @method _getFileHash
   * @description Calculate the hash values for a given file on disk.
   * 
   * @param {String} filePath path to the file to hash
   * 
   * @returns {Promise} resolves with an object containing the digests
   */
  _getFileHash(filePath, digestsAlgo=null) {
    if( !digestsAlgo ) {
      digestsAlgo = config.digests;
    }
    let digests = {};

    for( let algo of digestsAlgo ) {
      let hash = crypto.createHash(algo);
      digests[algo] = hash;
    }

    let stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 })
      .on('data', (chunk) => {
        for( let algo of digestsAlgo ) {
          digests[algo].update(chunk);
        }
      });

    let prom = new Promise((resolve, reject) => {
      stream.on('end', () => {
        for( let algo of digestsAlgo ) {
          digests[algo] = digests[algo].digest('hex');
        }
        resolve(digests);
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });

    return prom;
  }


  /**
   * @method _getHashFilePath
   * @description Get the relative file path for a given hash value.
   *
   * @param {String} hash hash value for the file
   *
   * @returns {String} relative file path
   */
  _getHashFilePath(hash) {
    return hash.substring(0,3) + '/' +
      hash.substring(3,6) + '/' +
      hash;
  }

  /**
   * @method _getHashBucket
   * @description Resolve the GCS bucket name for a given hash value by querying the database.
   * Falls back to the configured default bucket if none is stored.
   *
   * @param {String} hash hash value
   * @param {Object} dbClient optional postgres client
   * @returns {Promise<String>} bucket name
   */
  async _getHashBucket(hash, dbClient) {
    let client = dbClient || this.dbClient;
    let res = await client.query(
      `SELECT bucket FROM ${config.database.schema}.hash WHERE value = $1`,
      [hash]
    );
    return (res.rows[0] && res.rows[0].bucket) || config.cloudStorage.defaultBucket;
  }

}

export default Cas;