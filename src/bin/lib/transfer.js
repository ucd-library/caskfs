import tarStream from 'tar-stream';
import zlib from 'zlib';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createContext } from '../../../src/lib/context.js';
import config from '../../../src/lib/config.js';

class Transfer {

  /**
   * @method fsImport
   * @description Import CAS files and optional ACL/auto-partition data from a .tar.gz archive
   * or an already-extracted directory. Works in both direct-pg and http client modes.
   *
   * When src is a .tar.gz file and no extractLocation override is provided, a temporary
   * directory is created and cleaned up in the finally block. The tmp-file callback fires
   * so the CLI can register the path for cleanup on unexpected process termination.
   *
   * When src is an already-extracted directory, or when the caller supplies
   * opts.extractLocation, that directory is never deleted by this method.
   *
   * @param {String} src - absolute path to a .tar.gz archive or an already-extracted directory
   * @param {Object} [opts={}]
   * @param {Object} opts.cask - CaskFS client (HttpCaskFsClient or CaskFs instance)
   * @param {String} [opts.requestor] - requestor identity (required for direct-pg)
   * @param {Object} [opts.dbClient] - database connection (required for direct-pg)
   * @param {Boolean} [opts.overwrite=false] - replace existing file records on conflict
   * @param {String} [opts.aclConflict='fail'] - 'fail' | 'skip' | 'merge' on ACL conflicts
   * @param {String} [opts.autoPartitionConflict='fail'] - 'fail' | 'skip' | 'merge' on rule conflicts
   * @param {String} [opts.extractLocation] - override the temp extraction directory; caller owns cleanup
   * @param {Function} [opts.cb] - progress callback receiving typed event objects
   * @returns {Promise<Object>} import summary
   */
  async fsImport(src, opts={}) {
    const cask = opts.cask;
    if (!cask) throw new Error('CaskFS client instance is required for import');

    const isHttp = cask.mode === 'http';

    if (!isHttp) {
      if (!opts.dbClient) throw new Error('Database connection is required for direct-pg import');
      if (!opts.requestor) throw new Error('Requestor identity is required for direct-pg import');
      await opts.dbClient.connect();
    }

    const { files, lookup, aclData, autoPartitionData, extractLocation, cleanupExtracted } =
      await this._extractAndScan(src, opts);

    try {
      let stats;
      if (isHttp) {
        stats = await this._importHttp(files, lookup, extractLocation, cask, opts);
      } else {
        stats = await this._importDirectPg(files, lookup, extractLocation, cask, opts);

        const hasAcl = Object.values(aclData).some(v => v?.length);
        if (hasAcl) {
          await this._importAcl(aclData, cask, opts);
        }

        const hasAutoPartition = (autoPartitionData.partitions?.length || autoPartitionData.buckets?.length);
        if (hasAutoPartition) {
          await this._importAutoPartition(autoPartitionData, cask, opts);
        }
      }

      return stats;
    } finally {
      if (cleanupExtracted) {
        await fsp.rm(extractLocation, { recursive: true, force: true });
      }
    }
  }

  /**
   * @method _extractAndScan
   * @description Extract a .tar.gz archive to a temp directory (or scan an existing directory),
   * then parse all CAS, ACL, and auto-partition metadata into structured data.
   *
   * Fires the following callbacks (when opts.cb is set):
   *   { type: 'tmp-file',          path }         — temp extraction dir created (CLI registers for cleanup)
   *   { type: 'extract-complete' }                 — archive fully extracted to disk
   *   { type: 'preflight-complete', stats }        — files scanned, totals known
   *
   * @param {String} src - absolute path to a .tar.gz file or extracted directory
   * @param {Object} opts
   * @param {String} [opts.extractLocation] - override temp extraction directory; caller owns cleanup
   * @param {Function} [opts.cb] - progress callback
   * @returns {Promise<{files, lookup, aclData, autoPartitionData, extractLocation, cleanupExtracted}>}
   */
  async _extractAndScan(src, opts={}) {
    let extractLocation;
    let cleanupExtracted = false;

    const stat = fs.lstatSync(src);

    if (stat.isFile()) {
      if (opts.extractLocation) {
        // Caller provided a location — extract there, caller owns cleanup
        extractLocation = opts.extractLocation;
      } else {
        // Create our own temp dir and clean it up in the finally block
        const parts = path.parse(src);
        extractLocation = path.join(parts.dir, '._' + parts.name + '_extracted');
        cleanupExtracted = true;
        if (opts.cb) opts.cb({ type: 'tmp-file', path: extractLocation });
      }

      if (fs.existsSync(extractLocation)) {
        await fsp.rm(extractLocation, { recursive: true });
      }
      await fsp.mkdir(extractLocation, { recursive: true });

      await this._extractArchiveToLocation(fs.createReadStream(src), extractLocation);

      if (opts.cb) opts.cb({ type: 'extract-complete' });
    } else {
      // Already-extracted directory — use in place, never delete
      extractLocation = src;
    }

    // Scan CAS raw files and parse their .json metadata sidecar files
    const casPaths = await this._scanCasDir(path.join(extractLocation, 'cas'));

    const files = [];
    const lookup = new Map();

    for (const casFilePath of casPaths) {
      const raw = await fsp.readFile(casFilePath + '.json', 'utf-8');
      const meta = JSON.parse(raw);
      for (const f of (meta.files || [])) {
        const filePath = path.join(f.directory, f.filename);
        const descriptor = {
          hash: meta.value,
          filename: f.filename,
          directory: f.directory,
          partitionKeys: f.partitionKeys,
          metadata: f.metadata ? { ...f.metadata } : undefined,
        };
        if (descriptor.metadata) delete descriptor.metadata.resourceType;
        files.push(descriptor);
        lookup.set(filePath, descriptor);
      }
    }

    // Read optional ACL and auto-partition manifests
    const aclData = await this._readJsonDir(
      path.join(extractLocation, 'acl'),
      ['roles.json', 'users.json', 'user-roles.json', 'permissions.json']
    );
    const autoPartitionData = await this._readJsonDir(
      path.join(extractLocation, 'auto-partition'),
      ['partitions.json', 'buckets.json']
    );

    if (opts.cb) {
      opts.cb({
        type: 'preflight-complete',
        stats: {
          totalFiles: files.length,
          totalHashes: casPaths.length,
        }
      });
    }

    return { files, lookup, aclData, autoPartitionData, extractLocation, cleanupExtracted };
  }

  /**
   * @method _importDirectPg
   * @description Process import batches for a direct-pg CaskFs instance using CaskFS.sync().
   * Files that sync reports as doesNotExist (hash missing from CAS) are written individually
   * from the extracted directory.  Hashes already seen in the current batch are deduped so
   * the raw CAS file is only streamed once even when multiple paths share it.
   *
   * @param {Array} files - flat array of file descriptors from _extractAndScan
   * @param {Map} lookup - filePath → descriptor
   * @param {String} extractLocation - path to extracted archive contents
   * @param {Object} cask - CaskFs (direct-pg) instance
   * @param {Object} opts
   * @returns {Promise<Object>} stats
   */
  async _importDirectPg(files, lookup, extractLocation, cask, opts={}) {
    const batchSize = opts.batchSize || config.sync.defaultBatchSize;
    const db = opts.dbClient;
    const stats = {
      filesProcessed: 0,
      filesInserted: 0,
      metadataUpdates: 0,
      noChanges: 0,
      errors: 0,
    };

    const remaining = [...files];
    while (remaining.length > 0) {
      const batch = remaining.splice(0, batchSize);

      try {
        const result = await cask.sync({ requestor: opts.requestor }, {
          files: batch,
          replace: opts.overwrite || false,
        });

        stats.filesInserted += result.fileInserts.length;
        stats.metadataUpdates += result.metadataUpdates.length;
        stats.noChanges += result.noChanges.length;
        stats.errors += result.errors?.length || 0;
        result.errors.forEach(e => console.error(e));

        const writtenHashes = new Set();
        for (const filePath of result.doesNotExist) {
          const descriptor = lookup.get(filePath);
          if (!descriptor) continue;

          const wContext = createContext({
            requestor: opts.requestor,
            filePath,
            replace: opts.overwrite || false,
            partitionKeys: descriptor.partitionKeys,
            metadata: descriptor.metadata,
          }, db);

          wContext.update({
            replace: opts.overwrite || false,
            partitionKeys: descriptor.partitionKeys,
            metadata: descriptor.metadata,
          });

          if (writtenHashes.has(descriptor.hash)) {
            // Raw CAS file already written this batch — just link the file record
            wContext.data.hash = descriptor.hash;
          } else {
            wContext.data.readStream = fs.createReadStream(
              path.join(extractLocation, 'cas', cask.cas._getHashFilePath(descriptor.hash))
            );
          }

          await cask.write(wContext);
          writtenHashes.add(descriptor.hash);
          stats.filesInserted += 1;
        }

        stats.filesProcessed += batch.length;
        if (opts.cb) opts.cb({ type: 'batch-sync', stats });
      } catch (err) {
        console.error(err);
        stats.errors += 1;
      }
    }

    return stats;
  }

  /**
   * @method _importHttp
   * @description Process import batches for an HTTP client using optimisticBatchWrite().
   * When a batch reports hashes not present on the server, the raw CAS binary is uploaded
   * for the first file referencing that hash.  Remaining files sharing the same hash are
   * queued for a follow-up optimistic batch once the hash is live on the server.
   *
   * ACL and auto-partition data are not imported in HTTP mode — those operations require
   * direct database access.  A warning is printed if the archive contains such data.
   *
   * @param {Array} files - flat array of file descriptors from _extractAndScan
   * @param {Map} lookup - filePath → descriptor
   * @param {String} extractLocation - path to extracted archive contents
   * @param {Object} cask - HttpCaskFsClient instance
   * @param {Object} opts
   * @returns {Promise<Object>} stats
   */
  async _importHttp(files, lookup, extractLocation, cask, opts={}) {
    const BATCH_SIZE = 100;
    const stats = {
      filesProcessed: 0,
      filesInserted: 0,
      hashesUploaded: 0,
      errors: [],
    };

    const followUpDescriptors = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const result = await cask.optimisticBatchWrite(batch);

      stats.filesInserted +=
        (result.written?.length || 0) +
        (result.metadataUpdated?.length || 0) +
        (result.noChange?.length || 0);
      for (const e of (result.errors || [])) stats.errors.push(e);

      stats.filesProcessed += batch.length;
      if (opts.cb) opts.cb({ type: 'batch-sync', stats });

      if (!result.doesNotExist?.length) continue;

      // Group by hash so each CAS binary is uploaded exactly once
      const hashGroups = new Map();
      for (const filePath of result.doesNotExist) {
        const descriptor = lookup.get(filePath);
        if (!descriptor) continue;
        if (!hashGroups.has(descriptor.hash)) hashGroups.set(descriptor.hash, []);
        hashGroups.get(descriptor.hash).push(descriptor);
      }

      for (const [hash, descriptorsForHash] of hashGroups) {
        const first = descriptorsForHash[0];
        const casPath = path.join(
          extractLocation, 'cas',
          hash.substring(0, 3), hash.substring(3, 6), hash
        );

        try {
          await cask.write({
            filePath: path.join(first.directory, first.filename),
            readPath: casPath,
            mimeType: first.metadata?.mimeType || 'application/octet-stream',
            metadata: first.metadata,
            partitionKeys: first.partitionKeys,
            replace: opts.overwrite || false,
          });
          stats.hashesUploaded++;
          stats.filesInserted++;
        } catch (err) {
          stats.errors.push({
            path: path.join(first.directory, first.filename),
            message: err.message,
          });
        }

        if (opts.cb) opts.cb({ type: 'batch-sync', stats });

        // Queue remaining files sharing this hash for a follow-up batch
        for (const d of descriptorsForHash.slice(1)) followUpDescriptors.push(d);
      }
    }

    // Follow-up batch for files whose hash was just uploaded
    for (let i = 0; i < followUpDescriptors.length; i += BATCH_SIZE) {
      const batch = followUpDescriptors.slice(i, i + BATCH_SIZE);
      const result = await cask.optimisticBatchWrite(batch);

      stats.filesInserted +=
        (result.written?.length || 0) +
        (result.metadataUpdated?.length || 0) +
        (result.noChange?.length || 0);
      for (const p of (result.doesNotExist || [])) {
        stats.errors.push({ path: p, message: 'Hash not found after upload' });
      }
      for (const e of (result.errors || [])) stats.errors.push(e);

      stats.filesProcessed += batch.length;
      if (opts.cb) opts.cb({ type: 'batch-sync', stats });
    }

    return stats;
  }

  /**
   * @method _importAcl
   * @description Apply ACL data from the archive using high-level acl lib calls.
   * Conflict behaviour is controlled by opts.aclConflict: 'fail' (default), 'skip', or 'merge'.
   *
   * Roles and users: ensureRole/ensureUser are idempotent (ON CONFLICT DO NOTHING) so skip
   * and merge both safely call through.  Only fail mode performs an existence check first.
   *
   * Directory permissions: fail throws if an ACL already exists for the directory;
   * skip bypasses all permissions for that directory; merge adds new permissions on top.
   *
   * @param {Object} aclData - { roles, users, 'user-roles', permissions }
   * @param {Object} cask - CaskFs (direct-pg) instance
   * @param {Object} opts
   * @returns {Promise<void>}
   */
  async _importAcl(aclData, cask, opts={}) {
    const conflict = opts.aclConflict || 'fail';
    const db = opts.dbClient;
    const acl = cask.acl;
    const schema = config.database.schema;

    for (const { name } of (aclData.roles || [])) {
      if (conflict === 'fail') {
        const res = await db.query(`SELECT 1 FROM ${schema}.acl_role WHERE name = $1`, [name]);
        if (res.rows.length > 0) throw new Error(`ACL role already exists: ${name}`);
      }
      await acl.ensureRole({ role: name, dbClient: db });
    }

    for (const { name } of (aclData.users || [])) {
      if (conflict === 'fail') {
        const res = await db.query(`SELECT 1 FROM ${schema}.acl_user WHERE name = $1`, [name]);
        if (res.rows.length > 0) throw new Error(`ACL user already exists: ${name}`);
      }
      await acl.ensureUser({ user: name, dbClient: db });
    }

    for (const { user, role } of (aclData['user-roles'] || [])) {
      if (conflict === 'fail') {
        const roleRow = await db.query(
          `SELECT role_id FROM ${schema}.acl_role WHERE name = $1`, [role]
        );
        const userRow = await db.query(
          `SELECT user_id FROM ${schema}.acl_user WHERE name = $1`, [user]
        );
        if (roleRow.rows.length > 0 && userRow.rows.length > 0) {
          const exists = await db.query(
            `SELECT 1 FROM ${schema}.acl_role_user WHERE role_id = $1 AND user_id = $2`,
            [roleRow.rows[0].role_id, userRow.rows[0].user_id]
          );
          if (exists.rows.length > 0) {
            throw new Error(`User-role mapping already exists: ${user} -> ${role}`);
          }
        }
      }
      await acl.ensureUserRole({ user, role, dbClient: db });
    }

    for (const { directory, public: isPublic, permissions } of (aclData.permissions || [])) {
      const existing = await db.query(`
        SELECT rda.root_directory_acl_id
        FROM ${schema}.root_directory_acl rda
        JOIN ${schema}.directory d ON rda.directory_id = d.directory_id
        WHERE d.fullname = $1
      `, [directory]);

      if (existing.rows.length > 0) {
        if (conflict === 'fail') throw new Error(`ACL already exists for directory: ${directory}`);
        if (conflict === 'skip') continue;
        // merge: fall through and add permissions on top of the existing ACL
      }

      await acl.ensureRootDirectoryAcl({ directory, isPublic: !!isPublic, dbClient: db });
      for (const { role, permission } of (permissions || [])) {
        await acl.setDirectoryPermission({ directory, role, permission, dbClient: db });
      }
    }
  }

  /**
   * @method _importAutoPartition
   * @description Apply auto-partition and auto-bucket rules from the archive.
   * Conflict behaviour is controlled by opts.autoPartitionConflict: 'fail', 'skip', or 'merge'.
   *
   * @param {Object} autoPartitionData - { partitions, buckets }
   * @param {Object} cask - CaskFs (direct-pg) instance
   * @param {Object} opts
   * @returns {Promise<void>}
   */
  async _importAutoPartition(autoPartitionData, cask, opts={}) {
    const conflict = opts.autoPartitionConflict || 'fail';

    for (const rule of (autoPartitionData.partitions || [])) {
      const exists = await cask.autoPath.partition.exists(rule.name);
      if (exists) {
        if (conflict === 'fail') throw new Error(`Partition rule already exists: ${rule.name}`);
        if (conflict === 'skip') continue;
        // merge: upsert via set()
      }
      await cask.autoPath.partition.set({
        name: rule.name,
        index: rule.index,
        filterRegex: rule.filter_regex,
        getValue: rule.get_value,
      });
    }

    for (const rule of (autoPartitionData.buckets || [])) {
      const exists = await cask.autoPath.bucket.exists(rule.name);
      if (exists) {
        if (conflict === 'fail') throw new Error(`Bucket rule already exists: ${rule.name}`);
        if (conflict === 'skip') continue;
      }
      await cask.autoPath.bucket.set({
        name: rule.name,
        index: rule.index,
        filterRegex: rule.filter_regex,
        getValue: rule.get_value,
      });
    }
  }

  /**
   * @method _scanCasDir
   * @description Recursively scan a cas/ directory and return absolute paths to all
   * non-.json entries (the raw CAS binary files).
   *
   * @param {String} casDir - absolute path to the cas/ directory
   * @returns {Promise<String[]>}
   */
  async _scanCasDir(casDir) {
    const results = [];
    const walk = async (dir) => {
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return; // directory absent (empty archive or no CAS section)
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && !entry.name.endsWith('.json')) {
          results.push(full);
        }
      }
    };
    await walk(casDir);
    return results;
  }

  /**
   * @method _readJsonDir
   * @description Read named JSON files from a directory into an object keyed by base name
   * (filename minus .json extension).  Missing or malformed files are silently skipped.
   *
   * @param {String} dir - directory to read from
   * @param {String[]} names - filenames to attempt (e.g. ['roles.json', 'users.json'])
   * @returns {Promise<Object>}
   */
  async _readJsonDir(dir, names) {
    const result = {};
    for (const name of names) {
      try {
        const raw = await fsp.readFile(path.join(dir, name), 'utf-8');
        result[name.replace('.json', '')] = JSON.parse(raw);
      } catch {
        // absent or malformed — skip
      }
    }
    return result;
  }

  /**
   * @method _extractArchiveToLocation
   * @description Extract all tar.gz entries to extractLocation, preserving archive-relative paths.
   * Path-traversal entries are rejected.
   *
   * @param {stream.Readable} input - tar.gz readable stream
   * @param {String} extractLocation - absolute destination root
   * @returns {Promise<void>}
   */
  async _extractArchiveToLocation(input, extractLocation) {
    const gunzip = zlib.createGunzip();
    const extract = tarStream.extract();

    extract.on('entry', async (header, stream, next) => {
      try {
        const relPath = path.normalize(header.name).replace(/^(\.\.(\/|\\|$))+/, '');
        const destPath = path.join(extractLocation, relPath);

        // Prevent path traversal outside extractLocation
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

        await this._drainStream(stream);
        next();
      } catch (err) {
        stream.resume();
        next(err);
      }
    });

    await pipeline(input, gunzip, extract);
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
