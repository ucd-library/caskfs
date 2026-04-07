import tarStream from 'tar-stream';
import zlib from 'zlib';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import config from './config.js';
import { getLogger } from './logger.js';
import { DuplicateFileError } from './errors.js';
import Database from './database/index.js';

const RDF_MIME_TYPES = new Set([
  'application/ld+json',
  'application/n-quads',
  'application/n-triples',
  'text/n3',
  'text/turtle'
]);

const JSONLD_EXT = '.jsonld.json';

/**
 * @class Transfer
 * @description Handles import and export of CaskFS content as streaming .tar.gz archives.
 * The archive layout is:
 *   cas/{h0-2}/{h3-5}/{hash}       - raw CAS file content
 *   cas/{h0-2}/{h3-5}/{hash}.json  - per-hash metadata (file references, partition keys)
 *   acl/roles.json                  - ACL roles        (optional)
 *   acl/users.json                  - ACL users        (optional)
 *   acl/user-roles.json             - user-role links  (optional)
 *   acl/permissions.json            - directory ACLs   (optional)
 *   auto-partition/partitions.json  - partition rules  (optional)
 *   auto-partition/buckets.json     - bucket rules     (optional)
 */
class Transfer {

  /**
   * @param {Object} opts
   * @param {import('./database/index.js').default} opts.dbClient - shared Database instance
   * @param {import('./cas.js').default} opts.cas - CAS instance
   * @param {import('./directory.js').default} opts.directory - Directory instance
   * @param {import('./ld.js').default} opts.rdf - RDF instance
   * @param {import('./acl.js').default} opts.acl - ACL singleton
   * @param {Object} opts.autoPath - object with `partition` and `bucket` AutoPath instances
   * @param {String} [opts.schema] - database schema name
   */
  constructor(opts={}) {
    if (!opts.dbClient) throw new Error('dbClient is required');
    if (!opts.cas) throw new Error('cas is required');
    if (!opts.directory) throw new Error('directory is required');
    if (!opts.rdf) throw new Error('rdf is required');

    this.dbClient = opts.dbClient;
    this.cas = opts.cas;
    this.directory = opts.directory;
    this.rdf = opts.rdf;
    this.acl = opts.acl;
    this.autoPath = opts.autoPath;
    this.schema = opts.schema || config.database.schema;
    this.logger = getLogger('transfer');
  }

  // ---------------------------------------------------------------------------
  // PREFLIGHT
  // ---------------------------------------------------------------------------

  /**
   * @method exportPreflight
   * @description Return hash and file counts for a prospective export without
   * streaming any data.  Used by the CLI to confirm before starting a full export.
   *
   * @param {Object} opts
   * @param {String} opts.rootDir - Only count files under this CaskFS path
   * @returns {Promise<{hashCount: number, fileCount: number}>}
   */
  async exportPreflight(opts={}) {
    const rootDir   = (opts.rootDir || '/').replace(/\/+$/, '') || '/';
    const dirFilter = rootDir === '/'
      ? 'TRUE'
      : `(fv.directory = $1 OR fv.directory LIKE $1 || '/%')`;
    const params = rootDir === '/' ? [] : [rootDir];

    // Use DISTINCT ON to get one row per hash so we sum each CAS file's size
    // exactly once, regardless of how many filesystem paths reference it.
    const result = await this.dbClient.query(`
      WITH unique_hashes AS (
        SELECT DISTINCT ON (h.hash_id) h.hash_id, fv.size
        FROM ${this.schema}.hash h
        JOIN ${this.schema}.file_view fv ON fv.hash_value = h.value
        WHERE ${dirFilter}
        ORDER BY h.hash_id
      )
      SELECT
        (SELECT COUNT(DISTINCT h.hash_id)::int
         FROM ${this.schema}.hash h
         JOIN ${this.schema}.file_view fv ON fv.hash_value = h.value
         WHERE ${dirFilter})                          AS hash_count,
        (SELECT COUNT(fv.file_id)::int
         FROM ${this.schema}.file_view fv
         WHERE ${dirFilter})                          AS file_count,
        COALESCE(SUM(size), 0)::bigint               AS disk_size
      FROM unique_hashes
    `, params);

    const row = result.rows[0] || { hash_count: 0, file_count: 0, disk_size: 0 };
    return {
      hashCount: row.hash_count,
      fileCount: row.file_count,
      diskSize:  Number(row.disk_size),
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  /**
   * @method export
   * @description Export all CAS files and, optionally, ACL and auto-partition data to a
   * streaming .tar.gz archive.  Each unique hash is written exactly once regardless of how
   * many CaskFS file paths reference it.
   *
   * @param {String|import('stream').Writable} dest - absolute file path to write to, or a
   *   Writable stream to pipe into (e.g. an HTTP response)
   * @param {Object} opts
   * @param {String} opts.rootDir - required. only export files under this CaskFS path
   * @param {Boolean} [opts.includeAcl=false] - include ACL data in the export
   * @param {Boolean} [opts.includeAutoPartition=false] - include auto-partition rules
   * @param {Function} [opts.cb] - optional progress callback `({type, current, total, hash}) => {}`
   *
   * @returns {Promise<{hashCount: number, fileCount: number}>} export summary
   */
  async export(dest, opts={}) {
    if (!opts.rootDir) throw new Error('opts.rootDir is required for export');

    const pack = tarStream.pack();
    const gzip = zlib.createGzip();
    const output = typeof dest === 'string' ? fs.createWriteStream(dest) : dest;

    let summary = { hashCount: 0, fileCount: 0 };

    // Start the pipeline before feeding entries so backpressure is respected.
    const pipelinePromise = pipeline(pack, gzip, output);

    try {
      const casResult = await this._exportCas(pack, opts);
      summary.hashCount = casResult.hashCount;
      summary.fileCount = casResult.fileCount;

      if (opts.includeAcl) {
        await this._exportAcl(pack);
      }

      if (opts.includeAutoPartition) {
        await this._exportAutoPartition(pack);
      }
    } finally {
      pack.finalize();
    }

    await pipelinePromise;
    return summary;
  }

  /**
   * @method _exportCas
   * @description Stream all CAS raw files and their metadata JSON into the tar pack.
   * Each hash is processed exactly once.  Metadata is generated fresh from the database
   * rather than read from the on-disk .json so it always reflects the current DB state.
   * Only hashes with at least one file under opts.rootDir are included; the metadata JSON
   * likewise only lists file records under that path.
   *
   * @param {Object} pack - tar-stream pack instance
   * @param {Object} opts - options (rootDir, cb)
   * @returns {Promise<{hashCount: number, fileCount: number}>}
   */
  async _exportCas(pack, opts={}) {
    // Normalize rootDir: ensure leading slash, strip trailing slash (except root "/").
    const rootDir = (opts.rootDir || '/').replace(/\/+$/, '') || '/';
    const dirFilter = rootDir === '/'
      ? 'TRUE'
      : `(fv2.directory = $1 OR fv2.directory LIKE $1 || '/%')`;

    const params = rootDir === '/' ? [] : [rootDir];
    const aggFilter = rootDir === '/'
      ? 'WHERE fv.file_id IS NOT NULL'
      : `WHERE fv.file_id IS NOT NULL AND (fv.directory = $1 OR fv.directory LIKE $1 || '/%')`;

    // Fetch only hashes that have at least one file under rootDir.
    // The json_agg is also restricted to file records under rootDir.
    const result = await this.dbClient.query(`
      SELECT
        h.hash_id,
        h.value AS hash_value,
        COALESCE(
          json_agg(
            jsonb_build_object(
              'fileId',        fv.file_id,
              'filename',      fv.filename,
              'directory',     fv.directory,
              'metadata',      fv.metadata,
              'partitionKeys', fv.partition_keys
            ) ORDER BY fv.filepath
          ) FILTER (${aggFilter}),
          '[]'::json
        ) AS files
      FROM ${this.schema}.hash h
      LEFT JOIN ${this.schema}.file_view fv ON fv.hash_value = h.value
      WHERE h.value IN (
        SELECT DISTINCT fv2.hash_value
        FROM ${this.schema}.file_view fv2
        WHERE ${dirFilter}
      )
      GROUP BY h.hash_id, h.value
      ORDER BY h.value
    `, params);

    const rows = result.rows;
    const total = rows.length;
    let fileCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const hash = row.hash_value;
      const casFilePath = this.cas.diskPath(hash);
      // Use forward slashes so the archive is portable across platforms.
      const tarBase = 'cas/' + this.cas._getHashFilePath(hash);

      const stat = await fsp.stat(casFilePath);
      await this._addFileEntry(pack, tarBase, casFilePath, stat.size);

      const meta = {
        hash_id: row.hash_id,
        value: row.hash_value,
        files: row.files || []
      };
      await this._addBufferEntry(pack, tarBase + '.json',
        Buffer.from(JSON.stringify(meta, null, 2)));

      fileCount += meta.files.length;

      if (opts.cb) {
        opts.cb({ type: 'cas', current: i + 1, total, hash });
      }
    }

    return { hashCount: rows.length, fileCount };
  }

  /**
   * @method _exportAcl
   * @description Export ACL tables into the tar pack as four separate JSON files
   * under the acl/ prefix.
   *
   * @param {Object} pack - tar-stream pack instance
   * @returns {Promise<void>}
   */
  async _exportAcl(pack) {
    const roles = await this.dbClient.query(
      `SELECT name FROM ${this.schema}.acl_role ORDER BY name`
    );
    await this._addBufferEntry(pack, 'acl/roles.json',
      Buffer.from(JSON.stringify(roles.rows, null, 2)));

    const users = await this.dbClient.query(
      `SELECT name FROM ${this.schema}.acl_user ORDER BY name`
    );
    await this._addBufferEntry(pack, 'acl/users.json',
      Buffer.from(JSON.stringify(users.rows, null, 2)));

    const userRoles = await this.dbClient.query(
      `SELECT "user", role FROM ${this.schema}.acl_user_roles_view ORDER BY role, "user"`
    );
    await this._addBufferEntry(pack, 'acl/user-roles.json',
      Buffer.from(JSON.stringify(userRoles.rows, null, 2)));

    const perms = await this.dbClient.query(`
      SELECT
        d.fullname AS directory,
        rda.public,
        COALESCE(
          json_agg(
            jsonb_build_object('role', r.name, 'permission', p.permission)
          ) FILTER (WHERE p.acl_permission_id IS NOT NULL),
          '[]'::json
        ) AS permissions
      FROM ${this.schema}.root_directory_acl rda
      JOIN ${this.schema}.directory d ON rda.directory_id = d.directory_id
      LEFT JOIN ${this.schema}.acl_permission p ON rda.root_directory_acl_id = p.root_directory_acl_id
      LEFT JOIN ${this.schema}.acl_role r ON p.role_id = r.role_id
      GROUP BY d.fullname, rda.public
      ORDER BY d.fullname
    `);
    await this._addBufferEntry(pack, 'acl/permissions.json',
      Buffer.from(JSON.stringify(perms.rows, null, 2)));
  }

  /**
   * @method _exportAutoPartition
   * @description Export auto-partition and auto-bucket rules into the tar pack.
   *
   * @param {Object} pack - tar-stream pack instance
   * @returns {Promise<void>}
   */
  async _exportAutoPartition(pack) {
    const parts = await this.dbClient.query(
      `SELECT name, index, filter_regex, get_value FROM ${this.schema}.auto_path_partition ORDER BY name`
    );
    await this._addBufferEntry(pack, 'auto-partition/partitions.json',
      Buffer.from(JSON.stringify(parts.rows, null, 2)));

    const buckets = await this.dbClient.query(
      `SELECT name, index, filter_regex, get_value FROM ${this.schema}.auto_path_bucket ORDER BY name`
    );
    await this._addBufferEntry(pack, 'auto-partition/buckets.json',
      Buffer.from(JSON.stringify(buckets.rows, null, 2)));
  }

  // ---------------------------------------------------------------------------
  // IMPORT
  // ---------------------------------------------------------------------------

  /**
   * @method import
   * @description Import CAS files and optional ACL / auto-partition data from a .tar.gz archive
   * produced by export().  A single database connection is held open for the duration of the
   * import; each hash's file records are committed in their own transaction.
   *
   * @param {String|import('stream').Readable} src - absolute file path to read from, or a
   *   Readable stream to consume (e.g. an HTTP request body)
   * @param {Object} [opts={}]
   * @param {Boolean} [opts.overwrite=false] - replace existing file records; default throws DuplicateFileError
   * @param {String} [opts.aclConflict='fail'] - 'fail' | 'skip' | 'merge' on ACL conflicts
   * @param {String} [opts.autoPartitionConflict='fail'] - 'fail' | 'skip' | 'merge' on rule conflicts
   * @param {Function} [opts.cb] - optional progress callback `({type, current, total, hash}) => {}`
   *
   * @returns {Promise<{hashCount: number, fileCount: number, skippedFiles: number}>}
   */
  async import(src, opts={}) {
    const input = typeof src === 'string' ? fs.createReadStream(src) : src;
    const gunzip = zlib.createGunzip();
    const extract = tarStream.extract();

    // Raw CAS files come before their .json entries (alphabetical sort).
    // Track size so the .json processing can populate the hash record correctly.
    const rawFileCache = new Map();
    const aclData = {};
    const autoPartitionData = {};
    const summary = { hashCount: 0, fileCount: 0, skippedFiles: 0 };

    // One dedicated DB connection for the entire import operation.
    const db = new Database({ type: config.database.client });
    await db.connect();

    extract.on('entry', (header, stream, next) => {
      this._processImportEntry(header, stream, opts, rawFileCache, aclData, autoPartitionData, summary, db)
        .then(() => next())
        .catch(err => {
          stream.resume(); // drain so tar-stream can advance
          next(err);
        });
    });

    try {
      await pipeline(input, gunzip, extract);

      if (Object.keys(aclData).length > 0) {
        await this._importAcl(aclData, opts, db);
      }
      if (Object.keys(autoPartitionData).length > 0) {
        await this._importAutoPartition(autoPartitionData, opts);
      }
    } finally {
      await db.end();
    }

    return summary;
  }

  /**
   * @method _processImportEntry
   * @description Dispatch a single tar entry to the appropriate import handler.
   *
   * @param {Object} header - tar entry header (name, size, …)
   * @param {stream.Readable} stream - entry content stream; must be fully consumed
   * @param {Object} opts - import options
   * @param {Map} rawFileCache - shared map of hash → {size}
   * @param {Object} aclData - accumulator for buffered ACL JSON
   * @param {Object} autoPartitionData - accumulator for buffered auto-partition JSON
   * @param {Object} summary - mutable import summary counters
   * @param {import('./database/index.js').default} db - dedicated database connection
   * @returns {Promise<void>}
   */
  async _processImportEntry(header, stream, opts, rawFileCache, aclData, autoPartitionData, summary, db) {
    const name = header.name;

    if (name.startsWith('cas/')) {
      if (name.endsWith('.json')) {
        const buf = await this._readStream(stream);
        const meta = JSON.parse(buf.toString());
        const fileInfo = rawFileCache.get(meta.value) || { size: 0 };
        rawFileCache.delete(meta.value);

        const result = await this._importCasMetadata(meta, opts, fileInfo, db);
        summary.fileCount += result.imported;
        summary.skippedFiles += result.skipped;
      } else {
        const hash = path.basename(name);
        const destPath = this.cas.diskPath(hash);
        const { existed, size } = await this._writeCasRawFile(stream, destPath);
        rawFileCache.set(hash, { size });
        if (!existed) summary.hashCount++;
      }
    } else if (name.startsWith('acl/')) {
      const buf = await this._readStream(stream);
      const key = path.basename(name, '.json');
      aclData[key] = JSON.parse(buf.toString());
    } else if (name.startsWith('auto-partition/')) {
      const buf = await this._readStream(stream);
      const key = path.basename(name, '.json');
      autoPartitionData[key] = JSON.parse(buf.toString());
    } else {
      await this._drainStream(stream);
    }
  }

  /**
   * @method _writeCasRawFile
   * @description Write a raw CAS file from the tar stream to its on-disk CAS location.
   * If the file already exists the stream is drained without writing.
   *
   * @param {stream.Readable} stream - tar entry stream
   * @param {String} destPath - absolute path to the target CAS file
   * @returns {Promise<{existed: boolean, size: number}>}
   */
  async _writeCasRawFile(stream, destPath) {
    await this.cas.init();

    if (await this.cas.storage.exists(destPath)) {
      await this._drainStream(stream);
      const stat = await fsp.stat(destPath);
      return { existed: true, size: stat.size };
    }

    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(stream, fs.createWriteStream(destPath));
    const stat = await fsp.stat(destPath);
    return { existed: false, size: stat.size };
  }

  /**
   * @method _importCasMetadata
   * @description For a given hash's metadata object (parsed from the .json archive entry),
   * insert or update all referenced file records in the database within a single transaction.
   * RDF files are parsed and their triples inserted. The on-disk .json metadata file is
   * regenerated from the DB state after all records are committed.
   *
   * @param {Object} meta - parsed .json metadata object from the archive
   * @param {Object} opts - import options (overwrite, cb, …)
   * @param {Object} fileInfo - {size} from the raw CAS file step
   * @param {import('./database/index.js').default} db - dedicated database connection
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  async _importCasMetadata(meta, opts={}, fileInfo={}, db) {
    let imported = 0;
    let skipped = 0;

    if (!meta.value || !meta.files || meta.files.length === 0) {
      return { imported, skipped };
    }

    const hash = meta.value;
    const casFilePath = this.cas.diskPath(hash);
    const size = fileInfo.size || 0;
    // Use the known primary digest; the hash column value IS the sha256 digest.
    const digests = { [config.digests[0]]: hash };

    try {
      await db.query('BEGIN');

      for (const fileRecord of meta.files) {
        const filePath = path.join(fileRecord.directory, fileRecord.filename);
        const fileExists = await db.fileExists(filePath);

        if (fileExists) {
          if (!opts.overwrite) {
            throw new DuplicateFileError(filePath);
          }
          // Overwrite: update the existing record.
          const existing = await db.getFile({ filePath });
          const dirId = await this.directory.mkdir(fileRecord.directory, { dbClient: db });
          await db.updateFile({
            directoryId: dirId,
            filePath,
            hash,
            metadata: fileRecord.metadata || {},
            digests,
            size,
            user: 'import'
          });
          await db.clearFilePartitionKeys(existing.file_id);
          for (const pk of (fileRecord.partitionKeys || [])) {
            await db.addPartitionKeyToFile(existing.file_id, pk);
          }
          // Re-insert RDF if this is an RDF file.
          const mimeType = (fileRecord.metadata || {}).mimeType;
          if (RDF_MIME_TYPES.has(mimeType) || filePath.endsWith(JSONLD_EXT)) {
            await this.rdf.delete(existing, { dbClient: db, ignoreAcl: true });
            await this.rdf.insert(existing.file_id, { dbClient: db, filepath: casFilePath });
          }
        } else {
          const dirId = await this.directory.mkdir(fileRecord.directory, { dbClient: db });
          const fileId = await db.insertFile({
            directoryId: dirId,
            filePath,
            hash,
            metadata: fileRecord.metadata || {},
            digests,
            size,
            user: 'import'
          });
          for (const pk of (fileRecord.partitionKeys || [])) {
            await db.addPartitionKeyToFile(fileId, pk);
          }
          const mimeType = (fileRecord.metadata || {}).mimeType;
          if (RDF_MIME_TYPES.has(mimeType) || filePath.endsWith(JSONLD_EXT)) {
            await this.rdf.insert(fileId, { dbClient: db, filepath: casFilePath });
          }
          imported++;
        }
      }

      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    return { imported, skipped };
  }

  /**
   * @method _importAcl
   * @description Apply buffered ACL data to the database.  Conflict behaviour is controlled
   * by opts.aclConflict: 'fail' (default), 'skip', or 'merge'.
   *
   * @param {Object} aclData - {roles, users, 'user-roles', permissions}
   * @param {Object} opts
   * @param {import('./database/index.js').default} db - dedicated database connection
   * @returns {Promise<void>}
   */
  async _importAcl(aclData, opts={}, db) {
    const conflict = opts.aclConflict || 'fail';

    // Roles
    for (const { name } of (aclData.roles || [])) {
      const exists = await db.query(
        `SELECT 1 FROM ${this.schema}.acl_role WHERE name = $1`, [name]
      );
      if (exists.rows.length > 0) {
        if (conflict === 'fail') throw new Error(`ACL role already exists: ${name}`);
        continue; // skip or merge (roles carry no extra data)
      }
      await db.query(
        `INSERT INTO ${this.schema}.acl_role (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]
      );
    }

    // Users
    for (const { name } of (aclData.users || [])) {
      const exists = await db.query(
        `SELECT 1 FROM ${this.schema}.acl_user WHERE name = $1`, [name]
      );
      if (exists.rows.length > 0) {
        if (conflict === 'fail') throw new Error(`ACL user already exists: ${name}`);
        continue;
      }
      await db.query(
        `INSERT INTO ${this.schema}.acl_user (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]
      );
    }

    // User-role mappings
    for (const { user, role } of (aclData['user-roles'] || [])) {
      const roleRow = await db.query(
        `SELECT role_id FROM ${this.schema}.acl_role WHERE name = $1`, [role]
      );
      const userRow = await db.query(
        `SELECT user_id FROM ${this.schema}.acl_user WHERE name = $1`, [user]
      );
      if (roleRow.rows.length === 0 || userRow.rows.length === 0) {
        if (conflict === 'fail') {
          throw new Error(`Cannot map user-role: role=${role} user=${user} — one or both missing`);
        }
        continue;
      }
      const roleId = roleRow.rows[0].role_id;
      const userId = userRow.rows[0].user_id;
      const exists = await db.query(
        `SELECT 1 FROM ${this.schema}.acl_role_user WHERE role_id = $1 AND user_id = $2`,
        [roleId, userId]
      );
      if (exists.rows.length > 0) {
        if (conflict === 'fail') {
          throw new Error(`User-role mapping already exists: ${user} -> ${role}`);
        }
        continue;
      }
      await db.query(
        `INSERT INTO ${this.schema}.acl_role_user (role_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, userId]
      );
    }

    // Directory permissions
    for (const { directory, public: isPublic, permissions } of (aclData.permissions || [])) {
      const dirExists = await db.query(
        `SELECT 1 FROM ${this.schema}.directory WHERE fullname = $1`, [directory]
      );
      if (dirExists.rows.length === 0) {
        if (conflict === 'fail') {
          throw new Error(`Directory for ACL does not exist: ${directory}`);
        }
        continue;
      }

      const existing = await db.query(`
        SELECT rda.root_directory_acl_id
        FROM ${this.schema}.root_directory_acl rda
        JOIN ${this.schema}.directory d ON rda.directory_id = d.directory_id
        WHERE d.fullname = $1
      `, [directory]);

      if (existing.rows.length > 0) {
        if (conflict === 'fail') {
          throw new Error(`ACL already exists for directory: ${directory}`);
        }
        if (conflict === 'skip') continue;
        // merge: fall through and upsert
      }

      const { rootDirectoryAclId, directoryId } = await this.acl.ensureRootDirectoryAcl({ directory, isPublic: !!isPublic, dbClient: db });
      await this.acl.setDirectoryAcl({ directoryId, rootDirectoryAclId, dbClient: db });
      for (const { role, permission } of (permissions || [])) {
        const roleExists = await db.query(
          `SELECT 1 FROM ${this.schema}.acl_role WHERE name = $1`, [role]
        );
        if (roleExists.rows.length === 0) {
          if (conflict === 'fail') throw new Error(`Role not found for permission: ${role}`);
          continue;
        }
        await this.acl.setDirectoryPermission({ directory, role, permission, dbClient: db });
      }
    }

    if (aclData.permissions && aclData.permissions.length > 0) {
      await this.acl.refreshLookupTable({ dbClient: db });
    }
  }

  /**
   * @method _importAutoPartition
   * @description Apply buffered auto-partition and auto-bucket rules.  Conflict behaviour is
   * controlled by opts.autoPartitionConflict: 'fail' (default), 'skip', or 'merge'.
   *
   * @param {Object} autoPartitionData - {partitions, buckets}
   * @param {Object} opts
   * @returns {Promise<void>}
   */
  async _importAutoPartition(autoPartitionData, opts={}) {
    const conflict = opts.autoPartitionConflict || 'fail';

    for (const rule of (autoPartitionData.partitions || [])) {
      const exists = await this.autoPath.partition.exists(rule.name);
      if (exists) {
        if (conflict === 'fail') throw new Error(`Partition rule already exists: ${rule.name}`);
        if (conflict === 'skip') continue;
        // merge: fall through to set (upserts)
      }
      await this.autoPath.partition.set({
        name: rule.name,
        index: rule.index,
        filterRegex: rule.filter_regex,
        getValue: rule.get_value
      });
    }

    for (const rule of (autoPartitionData.buckets || [])) {
      const exists = await this.autoPath.bucket.exists(rule.name);
      if (exists) {
        if (conflict === 'fail') throw new Error(`Bucket rule already exists: ${rule.name}`);
        if (conflict === 'skip') continue;
      }
      await this.autoPath.bucket.set({
        name: rule.name,
        index: rule.index,
        filterRegex: rule.filter_regex,
        getValue: rule.get_value
      });
    }
  }

  // ---------------------------------------------------------------------------
  // STREAM HELPERS
  // ---------------------------------------------------------------------------

  /**
   * @method _addFileEntry
   * @description Stream a file from disk into the tar pack as an entry.
   *
   * @param {Object} pack - tar-stream pack instance
   * @param {String} name - entry name (archive path)
   * @param {String} filePath - absolute path to the source file
   * @param {Number} size - file size in bytes
   * @returns {Promise<void>}
   */
  _addFileEntry(pack, name, filePath, size) {
    return new Promise((resolve, reject) => {
      const entry = pack.entry({ name, size }, err => {
        if (err) reject(err);
        else resolve();
      });
      fs.createReadStream(filePath).pipe(entry);
    });
  }

  /**
   * @method _addBufferEntry
   * @description Write an in-memory buffer into the tar pack as an entry.
   *
   * @param {Object} pack - tar-stream pack instance
   * @param {String} name - entry name (archive path)
   * @param {Buffer} buffer - content to write
   * @returns {Promise<void>}
   */
  _addBufferEntry(pack, name, buffer) {
    return new Promise((resolve, reject) => {
      pack.entry({ name, size: buffer.length }, buffer, err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * @method _readStream
   * @description Fully buffer a readable stream and return its contents.
   *
   * @param {stream.Readable} stream
   * @returns {Promise<Buffer>}
   */
  _readStream(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
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

export default Transfer;
