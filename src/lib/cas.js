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
    let tmpFile = path.join(config.rootDir, 'tmp', uuidV4());
    this.logger.debug('Staging write to temp file', tmpFile, context.logSignal);

    // ensure the directory exists
    await fsp.mkdir(path.dirname(tmpFile), {recursive: true});

    // stage by write tmp file and calculate digests
    if( context.data.readStream ) {
      this.logger.debug('Staging write from readStream', context.logSignal);
      digests = await this.writeStream(tmpFile, context.data.readStream);
    } else if( context.data.readPath ) {
      this.logger.debug('Staging write from readPath', context.logSignal);
      digests = await this.writePath(tmpFile, context.data);
    } else if( context.data ) {
      this.logger.debug('Staging write from data', context.logSignal);
      digests = await this.writeData(tmpFile, context.data);
    } else if( context.hash ) {
      this.logger.debug('Staging write from existing hash', context.logSignal);
      digests = await this.writeHash(tmpFile, context.data);
    } else {
      throw new Error('No input specified for write operation');
    }

    // get file last modified time, created time and size
    // if the hash exists, we can use the cas file otherwise use the tmp file
    let statsFile;
    let primaryHash = config.digests[0];
    let hashFile = this.diskPath(digests[primaryHash]);
    let fileExists = false;

    if( fs.existsSync(hashFile) ) {
      statsFile = hashFile;
      fileExists = true;
    } else {
      statsFile = tmpFile;
    }

    // get file stats
    let stats = await fsp.stat(statsFile);

    let stagedFile = { 
      hash_value: digests[primaryHash],
      digests, 
      tmpFile,
      size: stats.size,
      hashFile, 
      hashExists: fileExists 
    };

    context.update({ stagedFile });
  }


  /**
   * @method finalizeWrite
   * @description Finalize a write operation by moving the temp file to its final location
   * if a file with the same hash does not already exist.
   * 
   * @param {String} tmpFile path to the temp file
   * @param {String} hashFile path to the final file location based on hash
   * @param {Object} opts copy options, mostly for bucket storage backends.
   * 
   * @returns {Promise<Boolean>} resolves with true if the file was copied, false if it already existed
   */
  async finalizeWrite(tmpFile, hashFile, nquads, opts={}) {
    let copied = false;
    await this.init();

    if( !await this.storage.exists(hashFile, opts) ) {
      copied = true;
      await this.storage.mkdir(path.dirname(hashFile), {recursive: true});
      await this.storage.copyFile(tmpFile, hashFile, opts);

      if( nquads ) {
        await opts.dbClient.query(`
          UPDATE ${config.database.schema}.hash SET nquads = $1 WHERE value = $2
        `, [nquads, path.basename(hashFile)]);
      }
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
    fullPath = this.diskPath(opts.hash);

    // just ensure the file exists
    if( !await this.exists(fullPath) ) {
      throw new HashNotFoundError(`File with hash ${opts.hash} does not exist in CASKFS`);
    }

    // JM - should we just do a db lookup, or recalculate all hashes
    //      in case the digest algorithms have changed?
    return this._getFileHash(fullPath);
  }

  /**
   * @function writeMetadata
   * @description Update the metadata JSON file for a given hash value.
   * 
   * @param {String} hash
   * 
   * @returns {Promise} 
   */
  async writeMetadata(hash) {
    await this.init();

    let fileMetadata = {
      hash_id: null,
      value: null,
      metadata: null,
      files: []
    };
    
    let files = await this.dbClient.query(`
      select * from ${config.database.schema}.file_view where hash_value = $1
    `, [hash]);
    files = files.rows;


    if (files.length > 0) {
      fileMetadata.hash_id = files[0].hash_id;
      fileMetadata.value = files[0].hash_value;
      fileMetadata.metadata = files[0].hash_metadata;
      fileMetadata.files = files.map(row => ({
        fileId: row.file_id,
        filename: row.filename,
        directory: row.directory,
        metadata: row.metadata,
        partitionKeys: row.partition_keys
      }));
    }

    let metadataFile = this.diskPath(hash)+'.json';

    await this.storage.mkdir(path.dirname(metadataFile), {recursive: true});
    await this.storage.writeFile(metadataFile, JSON.stringify(fileMetadata, null, 2));
  }

  /**
   * @method read
   * @description Return the file contents for the given hash value.
   * 
   * @param {String} hash
   * @param {Object} opts options object
   * @param {Boolean} opts.stream if true, return a readable stream instead of a buffer
   * @param {String} opts.encoding if specified, encode the file contents with the given encoding (e.g. 'utf8')
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
      return this.storage.createReadStream(fullPath, {encoding: opts.encoding || null});
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
      SELECT COUNT(*) AS count FROM ${config.database.schema}.file_view WHERE hash_value = $1
    `, [hash]);

    if( opts.softDelete === true ) {
      return {
        fileDeleted: false,
        referencesRemaining: parseInt(res.rows[0].count)
      }
    }

    let fileDeleted = false;
    if( res.rows[0].count === '0' ) {
      let fullPath = this.diskPath(hash);

      this.logger.info(`Deleting unreferenced file with hash ${hash} at path ${fullPath}`);

      if( await this.storage.exists(fullPath) ) {
        await this.storage.unlink(fullPath);
      }

      if( await this.storage.exists(fullPath + '.json') ) {
        await this.storage.unlink(fullPath + '.json');
      }
      fileDeleted = true;
    } else {
      await this.writeMetadata(hash);
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

  powerWash() {
    if( this.cloudStorageEnabled ) {
      throw new Error('Powerwash is not supported for cloud storage backends');
    }
    let dir = path.resolve(config.rootDir);
    console.log('Powerwashing CASKFS root directory:', dir);
    
    // Remove contents of directory but keep the directory itself
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      fs.rmSync(itemPath, { recursive: true, force: true });
    }
    console.log('CASKFS root directory contents removed from:', dir);
  }

  /**
   * @method _hashData
   * @description Calculate the hash values for a given data buffer.
   * 
   * @param {Buffer} data 
   * @returns 
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

}

export default Cas;