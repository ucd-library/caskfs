import config from './config.js';
import fs from 'fs';
import fsp from 'fs/promises';
import {v4 as uuidV4} from "uuid";
import path from 'path';
import crypto from "crypto";
import PgClient from './pg-client.js';

class Cas {

  constructor(opts={}) {
    this.pgClient = opts.pgClient || new PgClient();
  }

  async stageWrite(opts) {
    let digests;

    // create a temp file to write the stream to
    let tmpFile = path.join(config.rootDir, 'tmp', uuidV4());

    // ensure the directory exists
    await fsp.mkdir(path.dirname(tmpFile), {recursive: true});

    // stage by write tmp file and calculate digests
    if( opts.readStream ) {
      digests = await this.writeStream(tmpFile, opts);
    } else if( opts.readPath ) {
      digests = await this.writePath(tmpFile, opts);
    } else if( opts.data ) {
      digests = await this.writeData(tmpFile, opts);
    } else if( opts.hash ) {
      digests = await this.writeHash(tmpFile, opts);
    } else {
      throw new Error('No input specified for write operation');
    }

    // get file last modified time, created time and size
    // if the hash exists, we can use the cas file otherwise use the tmp file
    let statsFile;
    let primaryHash = config.digests[0];
    let hashFile = path.join(config.rootDir, this._getHashFilePath(digests[primaryHash]));
    
    if( fs.existsSync(hashFile) ) statsFile = hashFile;
    else statsFile = tmpFile;

    // get file stats
    let stats = await fsp.stat(statsFile);
    let metadata = {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };

    // add the other digests to the metadata
    for( let algo of Object.keys(digests) ) {
      metadata[algo] = digests[algo];
    }

    return { digests, tmpFile, metadata, hashFile};
  }


  /**
   * @method finalizeWrite
   * @description Finalize a write operation by moving the temp file to its final location
   * if a file with the same hash does not already exist.
   * 
   * @param {String} tmpFile path to the temp file
   * @param {String} hashFile path to the final file location based on hash
   * 
   * @returns {Promise<Boolean>} resolves with true if the file was copied, false if it already existed
   */
  async finalizeWrite(tmpFile, hashFile) {
    let copied = false;

    if( !fs.existsSync(hashFile) ) {
      copied = true;
      await fsp.mkdir(path.dirname(hashFile), {recursive: true});
      await fsp.copyFile(tmpFile, hashFile);
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
   * @param {ReadableStream} stream readable stream to write
   * @param {String} filePath path to the file to write
   * @returns {Promise} resolves with the calculated digests
   */
  writeStream(stream, filePath) {
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
      throw new Error('readPath must be an absolute path');
    }
    if( !fs.existsSync(opts.readPath) ) {
      throw new Error(`readPath does not exist: ${opts.readPath}`);
    }

    let digests = await this._getFileHash(opts.readPath);
    
    await fsp.copyFile(opts.readPath, tmpFile);

    return digests;
  }

  async writeData(tmpFile, opts) {
    await fsp.writeFile(tmpFile, opts.data);
    return this._getFileHash(tmpFile);
  }

  async writeHash(opts) {
    // just using an existing hash, so no file operations needed
    fullPath = path.join(config.rootDir, this._getHashFilePath(opts.hash));

    // just ensure the file exists
    if( !fs.existsSync(fullPath) ) {
      throw new Error(`File with hash ${opts.hash} does not exist in CASKFS`);
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
    let fileMetadata = {
      hash_id: null,
      value: null,
      metadata: null,
      files: []
    };
    
    let resp = await this.pgClient.query(`
      select * from ${config.pgSchema}.file_view where hash_value = $1
    `, [hash]);


    if (resp.rows.length > 0) {
      fileMetadata.hash_id = resp.rows[0].hash_id;
      fileMetadata.value = resp.rows[0].hash_value;
      fileMetadata.metadata = resp.rows[0].hash_metadata;
      fileMetadata.files = resp.rows.map(row => ({
        assetId: row.file_id,
        filename: row.filename,
        directory: row.directory,
        metadata: row.metadata
      }));
    }

    let filepath = this._getHashFilePath(hash);
    let fileParts = path.parse(filepath);
    let metadataFile = path.join(config.rootDir, fileParts.dir, fileParts.base + '.json');

    await fsp.writeFile(metadataFile, JSON.stringify(fileMetadata, null, 2));
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
  read(hash, opts={}) {
    const hashedFilePath = this._getHashFilePath(hash);
    const fullPath = path.join(config.rootDir, hashedFilePath);

    if( !fs.existsSync(fullPath) ) {
      throw new Error(`File with hash ${hash} does not exist in CASK FS`);
    }

    if( opts.stream === true ) {
      return fs.createReadStream(fullPath, {encoding: opts.encoding || null});
    }

    return fsp.readFile(fullPath, {encoding: opts.encoding || null});
  }

  /**
   * @method delete
   * @description Delete a file from the CASKFS and the underlying storage if no other references exist.
   * 
   * @param {String} hash hash value of the file to delete
   * @param {Object} opts options object
   * @param {PgClient} opts.pgClient optional postgres client to use
   * @param {Boolean} opts.softDelete if true, perform a soft delete (mark as deleted) instead of hard delete
   * 
   * @returns {Promise}
   */
  async delete(hash, opts={}) {
    let pgClient = opts.pgClient || this.pgClient;

    // check if any other files reference this hash
    let res = await pgClient.query(`
      SELECT COUNT(*) AS count FROM ${config.pgSchema}.file_view WHERE hash_value = $1
    `, [hash]);

    if( opts.softDelete === true ) {
      return {
        fileDeleted: false,
        referencesRemaining: parseInt(res.rows[0].count)
      }
    }

    let fileDeleted = false;
    if( res.rows[0].count === '0' ) {
      let fullPath = path.join(config.rootDir, this._getHashFilePath(hash));

      if( !fs.existsSync(fullPath) ) {
        await fsp.unlink(fullPath);
      }

      if( fs.existsSync(fullPath + '.json') ) {
        await fsp.unlink(fullPath + '.json');
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

  diskPath(hash) {
    return path.join(config.rootDir, this._getHashFilePath(hash));
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
  _getFileHash(filePath) {
    let digests = {};

    for( let algo of config.digests ) {
      let hash = crypto.createHash(algo);
      digests[algo] = hash;
    }

    let stream = fs.createReadStream(filePath).on('data', (chunk) => {
      for( let algo of config.digests ) {
        digests[algo].update(chunk);
      }
    });

    let prom = new Promise((resolve, reject) => {
      stream.on('end', () => {
        for( let algo of config.digests ) {
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