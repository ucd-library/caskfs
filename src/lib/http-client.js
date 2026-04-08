import { Readable, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import tarStream from 'tar-stream';

const pipelineAsync = promisify(pipeline);

/**
 * @class HttpCaskFsClient
 * @description HTTP-based client that mirrors the CaskFs interface for CLI use.
 * Makes fetch() calls to a running CaskFS HTTP server instead of connecting
 * directly to PostgreSQL and the filesystem.
 *
 * This client covers methods that have corresponding HTTP endpoints.
 * Operations without endpoints (ACL management, admin, auto-path writes,
 * archive) throw a descriptive error directing the user to use direct-pg mode.
 */
class HttpCaskFsClient {

  /**
   * @param {Object} opts
   * @param {String} opts.host - CaskFS server host including protocol (e.g. http://localhost:3000)
   * @param {String} [opts.path=/api] - API path prefix on the server (e.g. /api)
   * @param {String} [opts.token] - Bearer token for authentication
   * @param {String} [opts.requestor] - Default requestor username
   */
  constructor(opts={}) {
    const host = (opts.host || 'http://localhost:3000').replace(/\/$/, '');
    const apiPath = (opts.path || '/api').replace(/\/$/, '');
    this.baseUrl = `${host}${apiPath}`;
    this.token = opts.token || null;
    this.requestor = opts.requestor || null;
    this.mode = 'http';

    // No-op dbClient for drop-in compatibility with the CLI's endClient() call
    this.dbClient = { end: () => Promise.resolve() };

    // Namespace sub-objects wired in constructor
    this.rdf = this._buildRdf();
    this.acl = this._buildAcl();
    this.autoPath = this._buildAutoPath();
    this.transfer = this._buildTransfer();
    this.cas = this._buildCas();

    // Top-level delegates to match the CaskFs API surface
    this.exportPreflight = (opts) => this.transfer.exportPreflight(opts);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * @method _authHeaders
   * @description Build the Authorization header object if a token is configured.
   * @returns {Object}
   */
  _authHeaders() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  /**
   * @method _fetch
   * @description Fetch wrapper that injects auth headers and throws on non-2xx responses.
   * @param {String} url
   * @param {Object} [opts={}]
   * @returns {Promise<Response>}
   */
  async _fetch(url, opts={}) {

    const res = await fetch(url, {
      ...opts,
      headers: { ...this._authHeaders(), ...(opts.headers || {}) },
    });

    if (!res.ok) {
      let data;
      try { data = await res.json(); } catch(e) { data = {}; }
      const err = new Error(data.message || `${opts.method || 'GET'} ${url}\nHTTP ${res.status}: ${res.statusText}`);
      err.status = res.status;
      err.code = data.code;
      throw err;
    }

    return res;
  }

  /**
   * @method _extract
   * @description Extract the plain opts object from either a CaskFSContext or a plain object.
   * @param {Object} context
   * @returns {Object}
   */
  _extract(context) {
    if (context && typeof context === 'object' && context.data) {
      return context.data;
    }
    return context || {};
  }

  /**
   * @method _notSupported
   * @description Throw a clear error for methods that require direct-pg mode.
   * @param {String} methodName
   */
  _notSupported(methodName) {
    throw new Error(
      `"${methodName}" is not available in http mode. Switch to a direct-pg environment to use this command.`
    );
  }

  // ---------------------------------------------------------------------------
  // Filesystem methods
  // ---------------------------------------------------------------------------

  /**
   * @method write
   * @description Write a file to CaskFS via POST (create) or PUT (replace).
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath
   * @param {String} [context.readPath] - Local filesystem path to read from
   * @param {ReadableStream} [context.readStream] - Node.js readable stream
   * @param {Buffer|String} [context.data] - Raw content
   * @param {Boolean} [context.replace=false]
   * @param {String} [context.mimeType]
   * @param {String[]} [context.partitionKeys]
   * @param {Object} [context.metadata]
   * @param {String} [context.bucket]
   * @returns {Promise<Object>}
   */
  async write(context) {
    const d = this._extract(context);
    const { filePath, readPath, readStream, data, replace, mimeType, partitionKeys, metadata, bucket } = d;

    const url = new URL(`${this.baseUrl}/fs${filePath}`);
    if (partitionKeys?.length) url.searchParams.set('partition-keys', partitionKeys.join(','));
    if (bucket) url.searchParams.set('bucket', bucket);
    if (metadata && Object.keys(metadata).length) url.searchParams.set('metadata', JSON.stringify(metadata));

    let body;
    if (readPath) {
      body = fs.createReadStream(readPath);
    } else if (readStream) {
      body = readStream;
    } else if (data) {
      body = data;
    }

    const fetchOpts = {
      method: replace ? 'PUT' : 'POST',
      headers: { 'Content-Type': mimeType || 'application/octet-stream' },
      body,
    };

    // duplex: 'half' required when streaming a request body via Node.js fetch
    if (body && typeof body.pipe === 'function') {
      fetchOpts.duplex = 'half';
    }

    const res = await this._fetch(url.toString(), fetchOpts);
    return res.json();
  }

  /**
   * @method read
   * @description Read a file from CaskFS. Returns a Buffer by default; a stream when opts.stream=true.
   * @param {Object} context
   * @param {String} context.filePath
   * @param {Object} [opts={}]
   * @param {Boolean} [opts.stream=false]
   * @param {Number} [opts.start]
   * @param {Number} [opts.end]
   * @returns {Promise<Buffer>|ReadableStream}
   */
  async read(context, opts={}) {
    const { filePath } = this._extract(context);

    const headers = {};
    if (opts.start !== undefined) {
      headers['Range'] = `bytes=${opts.start}-${opts.end !== undefined ? opts.end : ''}`;
    }

    const res = await this._fetch(`${this.baseUrl}/fs${filePath}`, { headers });

    if (opts.stream) {
      return Readable.fromWeb(res.body);
    }

    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  }

  /**
   * @method metadata
   * @description Retrieve file metadata.
   * @param {Object} context
   * @param {String} context.filePath
   * @returns {Promise<Object>}
   */
  async metadata(context) {
    const { filePath } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/fs${filePath}?metadata=true`);
    return res.json();
  }

  /**
   * @method ls
   * @description List directory contents.
   * @param {Object} opts
   * @param {String} opts.directory
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @param {String} [opts.query]
   * @returns {Promise<Object>}
   */
  async ls(opts={}) {
    const { directory, limit, offset, query } = opts;
    const url = new URL(`${this.baseUrl}/dir${directory}`);
    if (limit  !== undefined) url.searchParams.set('limit',  limit);
    if (offset !== undefined) url.searchParams.set('offset', offset);
    if (query  !== undefined) url.searchParams.set('query',  query);
    const res = await this._fetch(url.toString());
    return res.json();
  }

  /**
   * @method exists
   * @description Check whether a path exists in CaskFS.
   * @param {Object} context
   * @param {String} context.filePath
   * @returns {Promise<Boolean>}
   */
  async exists(context) {
    const { filePath } = this._extract(context);
    try {
      await this._fetch(`${this.baseUrl}/fs${filePath}?metadata=true`);
      return true;
    } catch(e) {
      if (e.status === 404) return false;
      throw e;
    }
  }

  /**
   * @method deleteFile
   * @description Delete a file.
   * @param {Object} opts
   * @param {String} opts.filePath
   * @param {Boolean} [opts.softDelete]
   * @returns {Promise<Object>}
   */
  async deleteFile(opts={}) {
    const { filePath, softDelete } = opts;
    const url = new URL(`${this.baseUrl}/fs${filePath}`);
    if (softDelete) url.searchParams.set('softDelete', 'true');
    const res = await this._fetch(url.toString(), { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method deleteDirectory
   * @description Delete a directory and all its contents.
   * @param {Object} opts
   * @param {String} opts.directory
   * @param {Boolean} [opts.softDelete]
   * @returns {Promise<Object>}
   */
  async deleteDirectory(opts={}) {
    const { directory, softDelete } = opts;
    const url = new URL(`${this.baseUrl}/fs${directory}`);
    url.searchParams.set('directory', 'true');
    if (softDelete) url.searchParams.set('softDelete', 'true');
    const res = await this._fetch(url.toString(), { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method optimisticBatchWrite
   * @description Batch-write file records when CAS content is already present on the server.
   * No stream or buffer data is sent — each file is identified by its sha256 hash.
   *
   * @param {Array<Object>} files - array of file descriptors
   * @param {String} files[].filename  - bare filename
   * @param {String} files[].directory - absolute CaskFS directory path
   * @param {String} files[].hash      - sha256 hex digest
   * @param {Object} [files[].metadata]      - metadata object
   * @param {Array<String>} [files[].partitionKeys] - partition keys
   * @returns {Promise<{written, metadataUpdated, noChange, doesNotExist, errors}>}
   */
  async optimisticBatchWrite(files, opts={}) {
    const res = await this._fetch(`${this.baseUrl}/fs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    return res.json();
  }

  /**
   * @method relationships
   * @description Get inbound/outbound file relationships.
   * @param {Object} opts
   * @param {String} opts.filePath
   * @param {String[]} [opts.predicate]
   * @param {String[]} [opts.partitionKeys]
   * @param {String} [opts.graph]
   * @param {String} [opts.subject]
   * @param {Boolean} [opts.stats]
   * @returns {Promise<Object>}
   */
  async relationships(opts={}) {
    const { filePath, predicate, partitionKeys, graph, subject, stats } = opts;
    const url = new URL(`${this.baseUrl}/rel${filePath}`);
    if (predicate?.length)     url.searchParams.set('predicate',     predicate.join(','));
    if (partitionKeys?.length) url.searchParams.set('partitionKeys', partitionKeys.join(','));
    if (graph)   url.searchParams.set('graph',   graph);
    if (subject) url.searchParams.set('subject', subject);
    if (stats)   url.searchParams.set('stats',   'true');
    const res = await this._fetch(url.toString());
    return res.json();
  }

  /**
   * @method stats
   * @description Get CaskFS system statistics.
   * @returns {Promise<Object>}
   */
  async stats() {
    const res = await this._fetch(`${this.baseUrl}/system/stats`);
    return res.json();
  }

  /**
   * @method getCasLocation
   * @description In http mode the storage backend is opaque; returns 'remote'.
   * @returns {Promise<String>}
   */
  async getCasLocation() {
    return 'remote';
  }

  // ---------------------------------------------------------------------------
  // Namespace builders
  // ---------------------------------------------------------------------------

  _buildRdf() {
    const self = this;
    return {
      /**
       * @method rdf.find
       * @description Search for files by RDF properties.
       * @param {Object} opts
       * @returns {Promise<Object>}
       */
      async find(opts={}) {
        const { predicate, partitionKeys, graph, subject, object, type, limit, offset } = opts;
        const url = new URL(`${self.baseUrl}/find`);
        if (predicate)          url.searchParams.set('predicate',     predicate);
        if (subject)            url.searchParams.set('subject',       subject);
        if (object)             url.searchParams.set('object',        object);
        if (graph)              url.searchParams.set('graph',         graph);
        if (type)               url.searchParams.set('type',          type);
        if (partitionKeys?.length) url.searchParams.set('partitionKeys', partitionKeys.join(','));
        if (limit  !== undefined) url.searchParams.set('limit',  limit);
        if (offset !== undefined) url.searchParams.set('offset', offset);
        const res = await self._fetch(url.toString());
        return res.json();
      },

      read()    { self._notSupported('ld (rdf read)'); },
      literal() { self._notSupported('literal'); },
    };
  }

  _buildAcl() {
    const self = this;
    const ns = (name) => () => self._notSupported(`acl ${name}`);
    return {
      addUser:              ns('user-add'),
      removeUser:           ns('user-remove'),
      getUserRoles:         ns('user-role-get'),
      setUserRole:          ns('user-role-set'),
      removeUserRole:       ns('user-role-remove'),
      addRole:              ns('role-add'),
      removeRole:           ns('role-remove'),
      setPublic:            ns('public-set'),
      setPermission:        ns('permission-set'),
      removePermission:     ns('permission-remove'),
      remove:               ns('acl remove'),
      get:                  ns('acl get'),
      test:                 ns('acl test'),
      hasPermission:        ns('acl hasPermission'),
    };
  }

  _buildAutoPath() {
    const self = this;
    const ns = (name) => () => self._notSupported(`auto-path ${name}`);
    const stub = {
      getFromPath: ns('test'),
      set:         ns('set'),
      remove:      ns('remove'),
      getConfig:   ns('list'),
    };
    return { partition: stub, bucket: stub };
  }

  _buildTransfer() {
    const self = this;
    return {
      /**
       * @method transfer.exportPreflight
       * @description Fetch hash and file counts for a prospective export without
       * streaming any data.
       *
       * @param {Object} opts
       * @param {String} opts.rootDir - CaskFS path prefix to count
       * @returns {Promise<{hashCount: Number, fileCount: Number}>}
       */
      async exportPreflight(opts={}) {
        const url = new URL(`${self.baseUrl}/transfer/export/preflight`);
        url.searchParams.set('rootDir', opts.rootDir || '/');
        const res = await self._fetch(url.toString());
        return res.json();
      },

      /**
       * @method transfer.export
       * @description Export a CaskFS directory as a .tar.gz archive via the HTTP server.
       * Streams the response body directly to the destination file.
       *
       * @param {String} destPath - local file path to write the archive to
       * @param {Object} [opts={}]
       * @param {String} opts.rootDir - CaskFS path prefix to export
       * @param {Boolean} [opts.includeAcl=false]
       * @param {Boolean} [opts.includeAutoPartition=false]
       * @param {Function} [opts.cb] - progress callback; receives `{type, current, total}` as bytes arrive
       * @returns {Promise<{hashCount: Number, fileCount: Number}>}
       */
      async export(destPath, opts={}) {
        const url = new URL(`${self.baseUrl}/transfer/export`);
        url.searchParams.set('rootDir', opts.rootDir || '/');
        if (opts.includeAcl)           url.searchParams.set('includeAcl',           'true');
        if (opts.includeAutoPartition) url.searchParams.set('includeAutoPartition', 'true');

        const res = await self._fetch(url.toString());

        const body = Readable.fromWeb(res.body);
        const fileStream = fs.createWriteStream(destPath);

        let received = 0;
        const counter = new Transform({
          transform(chunk, _enc, cb) {
            received += chunk.length;
            if (opts.cb) opts.cb({ type: 'cas', current: received, total: received });
            cb(null, chunk);
          }
        });

        await pipelineAsync(body, counter, fileStream);

        // The server returns a streaming response with no summary JSON;
        // return a stub so callers that log counts don't crash.
        return { hashCount: 0, fileCount: 0 };
      },

      /**
       * @method transfer.import
       * @description Import a .tar.gz archive into CaskFS via the HTTP server using
       * optimistic batch writes.  The archive is extracted locally to a temp directory,
       * then file records are created in batches of 100 using optimisticBatchWrite.
       * When a batch reports hashes that are missing on the server, the raw CAS file is
       * uploaded (full write) for the first file referencing that hash, and any remaining
       * files with the same hash are queued for a follow-up batch write.
       *
       * Progress is reported via opts.cb after every batch or hash upload:
       *   opts.cb({ hashesUploaded, filesWritten, errors })
       *
       * @param {String} srcPath - local file path of the .tar.gz archive to import
       * @param {Object} [opts={}]
       * @param {Boolean} [opts.overwrite=false] - replace existing file records on conflict
       * @param {String} [opts.aclConflict='fail'] - ACL conflict mode: 'fail' | 'skip' | 'merge'
       * @param {String} [opts.autoPartitionConflict='fail'] - auto-partition conflict mode: 'fail' | 'skip' | 'merge'
       * @param {Function} [opts.cb] - progress callback; receives `{hashesUploaded, filesWritten, errors}`
       * @returns {Promise<{hashesUploaded: Number, filesWritten: Number, errors: Array}>}
       */
      async import(srcPath, opts={}) {
        const BATCH_SIZE = 100;
        const summary = { hashesUploaded: 0, filesWritten: 0, errors: [] };

        // 1. Extract the archive into a local temp directory
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'caskfs-import-'));

        try {
          await new Promise((resolve, reject) => {
            const extract = tarStream.extract();
            const gunzip  = zlib.createGunzip();

            extract.on('entry', (header, stream, next) => {
              if (header.type !== 'file') {
                stream.resume();
                next();
                return;
              }
              const destPath = path.join(tmpDir, header.name);
              fsp.mkdir(path.dirname(destPath), { recursive: true })
                .then(() => {
                  const out = fs.createWriteStream(destPath);
                  out.on('finish', next);
                  out.on('error', reject);
                  stream.on('error', reject);
                  stream.pipe(out);
                })
                .catch(reject);
            });

            extract.on('finish', resolve);
            extract.on('error', reject);
            gunzip.on('error', reject);

            fs.createReadStream(srcPath).pipe(gunzip).pipe(extract);
          });

          // 2. Scan extracted cas/**/*.json files to build hash → files map
          const hashToFiles = new Map();

          const scanDir = async (dir) => {
            let entries;
            try {
              entries = await fsp.readdir(dir, { withFileTypes: true });
            } catch(e) {
              return; // dir absent (empty archive)
            }
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await scanDir(full);
              } else if (entry.isFile() && entry.name.endsWith('.json')) {
                const raw = await fsp.readFile(full, 'utf-8');
                try {
                  const meta = JSON.parse(raw);
                  if (meta.value && Array.isArray(meta.files) && meta.files.length > 0) {
                    hashToFiles.set(meta.value, meta.files);
                  }
                } catch(e) { /* skip malformed */ }
              }
            }
          };

          await scanDir(path.join(tmpDir, 'cas'));

          // 3. Build flat descriptor list and path → hash lookup
          const allDescriptors = [];
          const pathToHash = new Map();

          for (const [hash, files] of hashToFiles) {
            for (const f of files) {
              const filePath = path.join(f.directory, f.filename);
              allDescriptors.push({
                filename: f.filename,
                directory: f.directory,
                hash,
                metadata: f.metadata,
                partitionKeys: f.partitionKeys,
              });
              pathToHash.set(filePath, hash);
            }
          }

          // 4. Process in batches — optimistic writes, then upload missing hashes
          const followUpDescriptors = [];

          for (let i = 0; i < allDescriptors.length; i += BATCH_SIZE) {
            const batch = allDescriptors.slice(i, i + BATCH_SIZE);
            const result = await self.optimisticBatchWrite(batch);

            summary.filesWritten += (result.written?.length || 0) +
                                    (result.metadataUpdated?.length || 0) +
                                    (result.noChange?.length || 0);
            for (const e of (result.errors || [])) summary.errors.push(e);

            if (opts.cb) opts.cb({ ...summary });

            if (!result.doesNotExist?.length) continue;

            // Group doesNotExist paths by hash — upload each CAS binary only once
            const hashGroups = new Map();
            for (const filePath of result.doesNotExist) {
              const hash = pathToHash.get(filePath);
              if (!hash) continue;
              if (!hashGroups.has(hash)) hashGroups.set(hash, []);
              const desc = batch.find(d => path.join(d.directory, d.filename) === filePath);
              if (desc) hashGroups.get(hash).push(desc);
            }

            for (const [hash, filesForHash] of hashGroups) {
              if (!filesForHash.length) continue;

              const first = filesForHash[0];
              const casPath = path.join(
                tmpDir, 'cas',
                hash.substring(0, 3), hash.substring(3, 6), hash
              );

              try {
                await self.write({
                  filePath: path.join(first.directory, first.filename),
                  readPath: casPath,
                  mimeType: first.metadata?.mimeType || 'application/octet-stream',
                  metadata: first.metadata,
                  partitionKeys: first.partitionKeys,
                  replace: opts.overwrite,
                });
                summary.hashesUploaded++;
                summary.filesWritten++;
              } catch(err) {
                summary.errors.push({
                  path: path.join(first.directory, first.filename),
                  message: err.message,
                });
              }

              if (opts.cb) opts.cb({ ...summary });

              // Remaining files sharing this hash → queue for follow-up batch
              for (const f of filesForHash.slice(1)) followUpDescriptors.push(f);
            }
          }

          // 5. Follow-up batch for files whose hash was just uploaded
          for (let i = 0; i < followUpDescriptors.length; i += BATCH_SIZE) {
            const batch = followUpDescriptors.slice(i, i + BATCH_SIZE);
            const result = await self.optimisticBatchWrite(batch);

            summary.filesWritten += (result.written?.length || 0) +
                                    (result.metadataUpdated?.length || 0) +
                                    (result.noChange?.length || 0);
            for (const p of (result.doesNotExist || [])) {
              summary.errors.push({ path: p, message: 'Hash not found after upload' });
            }
            for (const e of (result.errors || [])) summary.errors.push(e);

            if (opts.cb) opts.cb({ ...summary });
          }

          // 6. Re-stream ACL and auto-partition data to the server's import endpoint.
          //    A minimal tar.gz containing only those entries is built in memory and posted.
          const aclDir       = path.join(tmpDir, 'acl');
          const autoPartDir  = path.join(tmpDir, 'auto-partition');
          const [hasAcl, hasAutoPartition] = await Promise.all([
            fsp.access(aclDir).then(() => true).catch(() => false),
            fsp.access(autoPartDir).then(() => true).catch(() => false),
          ]);

          if (hasAcl || hasAutoPartition) {
            const pack = tarStream.pack();
            const gzip = zlib.createGzip();

            const packEntry = (header, content) => new Promise((resolve, reject) => {
              pack.entry(header, content, (err) => (err ? reject(err) : resolve()));
            });

            (async () => {
              try {
                if (hasAcl) {
                  for (const f of await fsp.readdir(aclDir)) {
                    const content = await fsp.readFile(path.join(aclDir, f));
                    await packEntry({ name: `acl/${f}`, size: content.length }, content);
                  }
                }
                if (hasAutoPartition) {
                  for (const f of await fsp.readdir(autoPartDir)) {
                    const content = await fsp.readFile(path.join(autoPartDir, f));
                    await packEntry({ name: `auto-partition/${f}`, size: content.length }, content);
                  }
                }
                pack.finalize();
              } catch(e) {
                pack.destroy(e);
              }
            })();

            const url = new URL(`${self.baseUrl}/transfer/import`);
            if (opts.aclConflict)           url.searchParams.set('aclConflict',           opts.aclConflict);
            if (opts.autoPartitionConflict) url.searchParams.set('autoPartitionConflict', opts.autoPartitionConflict);

            const body = Readable.toWeb(pack.pipe(gzip));
            await self._fetch(url.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/gzip' },
              body,
              duplex: 'half',
            });
          }

          return summary;

        } finally {
          await fsp.rm(tmpDir, { recursive: true, force: true });
        }
      },
    };
  }

  _buildCas() {
    const self = this;
    return {
      deleteUnusedHashes: () => self._notSupported('admin delete-unused-hashes'),
      getUnusedHashCount: () => self._notSupported('admin unused-hash-count'),
    };
  }

}

export default HttpCaskFsClient;
