import tarStream from 'tar-stream';
import zlib from 'zlib';
import fs, { fstatSync } from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createContext } from '../../../src/lib/context.js';
import config from '../../../src/lib/config.js';

class Transfer {

  /**
   * @method fsImport
   * @description Import CAS files and optional ACL / auto-partition data from a .tar.gz archive
   * produced by export(). This method extracts the archive and processes each entry and
   * provides a callback of batches of files to be imported via optimistic write impl then
   * 
   * 
   * @param {String|import('stream').Readable} src - absolute file path to read from, or a
   *   Readable stream to consume (e.g. an HTTP request body)
   * @param {Object} [opts={}]
   * @param {String} [opts.requestor] - requestor identity for imported files (required)
   * @param {Boolean} [opts.overwrite=false] - replace existing file records; default throws DuplicateFileError
   * @param {String} [opts.aclConflict='fail'] - 'fail' | 'skip' | 'merge' on ACL conflicts
   * @param {String} [opts.autoPartitionConflict='fail'] - 'fail' | 'skip' | 'merge' on rule conflicts
   * @param {Function} [opts.cb] - optional progress callback `({type, current, total, hash}) => {}`
   *
   * @returns {Promise<{hashCount: number, fileCount: number, skippedFiles: number}>}
   */
  async fsImport(src, opts={}) {
    let isFile = false, input = src;
    if( fs.lstatSync(src).isFile() ) {
      isFile = true;
      input = fs.createReadStream(src);
    } 

    const aclData = {};
    const autoPartitionData = {};

    const batchSize = opts.batchSize || config.sync.defaultBatchSize;
    const cask = opts.cask;
    const stats = {
      filesProcessed: 0,
      filesInserted : 0,
      metadataUpdates : 0,
      noChanges : 0,
      errors: 0
    };

    if( !cask ) {
      throw new Error('CaskFS client instance is required for import');
    }
    if( !opts.dbClient ) {
      throw new Error('Database connection is required for import');
    }
    if( !opts.requestor ) {
      throw new Error('Requestor identity is required for import');
    }

    // One dedicated DB connection for the entire import operation.
    const db = opts.dbClient;
    await db.connect();

    // extract location
  

    // now extract the archive, processing each entry as it comes.  The .json metadata entries
    // will come after their corresponding raw files, so the hash → size info will be available
    // in the rawFileCache when we process the .json entries.
    let files, extractLocation;
    if( isFile ) {
      extractLocation = opts.extractLocation;
      if( !extractLocation ) {
        let parts = path.parse(src);
        extractLocation = path.join(parts.dir, '._'+parts.name+'_extracted');
      }
      if( fs.existsSync(extractLocation) ) {
        await fs.promises.rm(extractLocation, { recursive: true });
      }
      await fs.promises.mkdir(extractLocation, { recursive: true });
      if( opts.cb ) {
        opts.cb({ type: 'tmp-file', path: extractLocation });
      }

      files = await this._extractArchiveToLocation(input, extractLocation);

      if( opts.cb ) {
        opts.cb({type: 'extract-complete'});
      }
    } else {
      // just scan directory
      files = {};
      console.log(`Scanning ${src} ...`);
      const walk = async (dir) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for( let entry of entries ) {
          const relPath = path.relative(src, path.join(dir, entry.name));

          if( entry.isDirectory() ) {
            await walk(relPath);
          } else {
            let type = relPath.replace(/^\//,'').split('/')[0]; // 'cas', 'acl', or 'auto-partition'
            if( !files[type] ) files[type] = [];
            if( !(type === 'cas' && relPath.endsWith('.json')) ) {
              files[type].push(relPath); 
            }
          }
        }
      };
      await walk(src);
    }

    if( !files.cas ) files.cas = [];
    files.files = [];
    let lookup = new Map();

    for( let file of files.cas ) { 
      let metadata = JSON.parse(await fs.promises.readFile(file + '.json'));
      metadata.files.forEach(f => {
        f.hash = metadata.value;
        delete f.fileId;
        delete f.metadata.resourceType;
        files.files.push(f);
        lookup.set(path.join(f.directory, f.filename), f);
      });
    }

    if( opts.cb ) {
      opts.cb({ 
        type: 'preflight-complete', 
        stats: { 
          totalFiles: files.files.length,
          totalHashes: files.cas.length
        } 
      });
    }

    while( files.files.length > 0 ) {
      let batch = files.files.splice(0, batchSize);

      try {
        let result = await cask.sync({requestor: opts.requestor}, {
          files: batch,
          replace: opts.overwrite || false,
        });
        
        stats.filesInserted += result.fileInserts.length;
        stats.metadataUpdates += result.metadataUpdates.length;
        stats.noChanges += result.noChanges.length;
        stats.errors += result.errors?.length || 0;
        result.errors.forEach(e => console.error(e));

        let writtenHashes = new Set();
        for( let file of result.doesNotExist ) {
          let metadata = lookup.get(file);

          let wContext = createContext({
            requestor: opts.requestor,
            filePath: file,
            replace : opts.overwrite || false,
            partitionKeys: metadata.partitionKeys,
            metadata: metadata.metadata
          }, db);

          wContext.update({
            replace : opts.overwrite || false,
            partitionKeys: metadata.partitionKeys,
            metadata: metadata.metadata
          })

          if( writtenHashes.has(metadata.hash) ) {
            // This hash was already written in this batch, so we can skip writing the raw file again.
            // Just update the context with the correct size for metadata processing and continue.
            wContext.data.hash = metadata.hash;
          } else {
            // This hash has not been written yet, so we need to write the raw file from the extracted location.
            wContext.data.readStream = fs.createReadStream(path.join(extractLocation || src, 'cas', cask.cas._getHashFilePath(metadata.hash)));
          }

          await cask.write(wContext);
          
          writtenHashes.add(metadata.hash);
          stats.filesInserted += 1;
        }

        stats.filesProcessed += batch.length;
        if( opts.cb ) {
          opts.cb({ type: 'batch-sync', stats});
        }
      } catch (err) {
        console.error(err);
        stats.errors += 1;
      }

    }

    if( fs.existsSync(extractLocation) ) {
      await fs.promises.rm(extractLocation, { recursive: true });
    }

    return stats;
  }

  /**
   * @method _extractArchiveToLocation
   * @description Extract all tar.gz entries to extractLocation, preserving archive-relative paths.
   *              extractLocation is the root directory for all extracted content.
   *
   * @param {stream.Readable} input - tar.gz readable stream
   * @param {String} extractLocation - absolute destination root
   * @returns {Promise<void>}
   */
  async _extractArchiveToLocation(input, extractLocation) {
    const gunzip = zlib.createGunzip();
    const extract = tarStream.extract();

    let files = {}

    extract.on('entry', async (header, stream, next) => {
      try {
        // keep archive layout rooted at extractLocation
        const relPath = path.normalize(header.name).replace(/^(\.\.(\/|\\|$))+/, '');
        const destPath = path.join(extractLocation, relPath);
        const type = relPath.replace(/^\//,'').split('/')[0]; // 'cas', 'acl', or 'auto-partition'
        if( !files[type] ) files[type] = [];
        if( !(type === 'cas' && relPath.endsWith('.json')) ) {
          files[type].push(destPath); 
        }

        // safety: prevent path traversal outside extractLocation
        const root = path.resolve(extractLocation) + path.sep;
        const resolvedDest = path.resolve(destPath);
        if (!resolvedDest.startsWith(root) && resolvedDest !== path.resolve(extractLocation)) {
          await this._drainStream(stream);
          return next(new Error(`Invalid tar entry path: ${header.name}`));
        }

        if (header.type === 'directory') {
          await fsp.mkdir(resolvedDest, { recursive: true });
          await this._drainStream(stream);
          return next();
        }

        if (header.type === 'file') {
          await fsp.mkdir(path.dirname(resolvedDest), { recursive: true });
          await pipeline(stream, fs.createWriteStream(resolvedDest));
          return next();
        }

        // skip links and other special entries
        await this._drainStream(stream);
        next();
      } catch (err) {
        stream.resume();
        next(err);
      }
    });

    await pipeline(input, gunzip, extract);

    return files;
  }

  /**
   * @method _drainStream
   * @description Drain a readable stream without consuming its data.
   *
   * @param {stream.Readable} stream
   * @returns {Promise<void>}
   */
  _drainStream(stream) {
    return new Promise((resolve, reject) => {
      stream.resume();
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

}

export { Transfer };