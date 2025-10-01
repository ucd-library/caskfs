import config from '../config.js';
import fs from 'fs';
import getLogger from '../logger.js'

class GCSStorage {

  constructor(opts={}) {
    this.dbClient = opts.dbClient;
    this.logger = getLogger('GCSStorage');
    this.keyFilename = opts.keyFilename || config.cloudStorage.serviceAccountFile;
  }

  async init() {
    if( this.client ) return this.client;
    
    if( !config.cloudStorage.enabled ) {
      throw new Error('Cloud storage is not enabled');
    }

    const {Storage} = await import('@google-cloud/storage');

    let opts = {};
    if( this.keyFilename ) {
      if( !fs.existsSync(this.keyFilename) ) {
        this.logger.warn(`Service account file does not exist: ${this.keyFilename}`);
      } else {
        opts.keyFilename = this.keyFilename;
      }
    }
    if( config.cloudStorage.project ) {
      opts.projectId = config.cloudStorage.project;
    }

    this.client = new Storage(opts);
  }

  bucket(name) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }
    if( !name ) {
      throw new Error('Bucket name is required');
    }
    return this.client.bucket(name);
  }

  async getFileBucket(filePath, opts={}) {
    let bucket = await (opts.dbClient || this.dbClient).getFileBucket(filePath);
    if( !bucket ) {
      throw new Error(`No bucket found for file path: ${filePath}`);
    }
    return bucket;
  }

  async createReadStream(filePath, opts={}) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }

    let file = this.bucket(await this.getFileBucket(filePath, opts))
                   .file(filePath);
    return file.createReadStream();
  }

  async readFile(filePath, opts={}) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }

    let file = this.bucket(await this.getFileBucket(filePath, opts))
                    .file(filePath);

    let buffer = (await file.download())[0];

    if( opts.encoding ) {
      return buffer.toString(opts.encoding);
    }
    return buffer;
  }

  writeFile(filePath, data, opts={}) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }
    if( !opts.bucket ) {
      throw new Error('Bucket name is required to write file to GCS');
    }

    let file = this.bucket(opts.bucket)
                    .file(filePath);

    const uploadOptions = {};
    if (opts.metadata) {
      uploadOptions.metadata = opts.metadata;
    }
    if (opts.contentType) {
      uploadOptions.contentType = opts.contentType;
    }
    if (opts.resumable !== undefined) {
      uploadOptions.resumable = opts.resumable;
    }
    return file.save(data, uploadOptions);
  }

  copyFile(localPath, gcsPath, opts={}) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }

    if( !fs.existsSync(localPath) ) {
      throw new Error(`Local file does not exist: ${localPath}`);
    }

    if( !opts.bucket ) {
      throw new Error('Bucket name is required to copy file to GCS');
    }

    let file = this.bucket(opts.bucket)
                    .file(gcsPath);

    const uploadOptions = {};
    if (opts.metadata) {
      uploadOptions.metadata = opts.metadata;
    }
    if (opts.mimeType) {
      uploadOptions.contentType = opts.mimeType;
    }
    if (opts.resumable !== undefined) {
      uploadOptions.resumable = opts.resumable;
    }
    if (opts.gzip !== undefined) {
      uploadOptions.gzip = opts.gzip;
    }

    // Create read stream from local file
    const readStream = fs.createReadStream(localPath);
    
    // Create write stream to GCS
    const writeStream = file.createWriteStream(uploadOptions);

    // Return a promise that resolves when the upload is complete
    return new Promise((resolve, reject) => {
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', () => {
        resolve({
          bucket: opts.bucket || config.cloudStorage.defaultBucket,
          name: gcsPath,
          localPath: localPath
        });
      });

      // Pipe the read stream to the write stream
      readStream.pipe(writeStream);
    });
  }

  async exists(filePath, opts={}) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }

    let file = this.bucket(await this.getFileBucket(filePath, opts))
                    .file(filePath);
    return file.exists().then(data => data[0]);
  }

  async unlink(filePath, opts={}) {
    if( !this.client ) {
      throw new Error('GCS client is not initialized');
    }

    let file = this.bucket(await this.getFileBucket(filePath, opts))
                    .file(filePath);
    return file.delete().catch(err => {
      if (err.code === 404) {
        // File does not exist, consider it deleted
        return;
      }
      throw err;
    });
  }


  mkdir() {
    return Promise.resolve();
  }

  
}

export default GCSStorage;