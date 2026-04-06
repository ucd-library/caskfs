import { Readable } from 'stream';
import fs from 'fs';

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

    console.log({
      ...opts,
      headers: { ...this._authHeaders(), ...(opts.headers || {}) },
    })

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

        const fileStream = fs.createWriteStream(destPath);
        const body = Readable.fromWeb(res.body);

        let received = 0;
        body.on('data', chunk => {
          received += chunk.length;
          if (opts.cb) opts.cb({ type: 'cas', current: received, total: received });
        });

        await new Promise((resolve, reject) => {
          body.pipe(fileStream);
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
          body.on('error', reject);
        });

        // The server returns a streaming response with no summary JSON;
        // return a stub so callers that log counts don't crash.
        return { hashCount: 0, fileCount: 0 };
      },

      /**
       * @method transfer.import
       * @description Import a .tar.gz archive into CaskFS via the HTTP server.
       * Streams the local file directly as the request body.
       *
       * @param {String} srcPath - local file path of the archive to upload
       * @param {Object} [opts={}]
       * @param {Boolean} [opts.overwrite=false]
       * @param {String} [opts.aclConflict='fail'] - 'fail' | 'skip' | 'merge'
       * @param {String} [opts.autoPartitionConflict='fail'] - 'fail' | 'skip' | 'merge'
       * @param {Function} [opts.cb] - progress callback; receives `{type, current, total}` as bytes are sent
       * @returns {Promise<{hashCount: Number, fileCount: Number, skippedFiles: Number}>}
       */
      async import(srcPath, opts={}) {
        const url = new URL(`${self.baseUrl}/transfer/import`);
        if (opts.overwrite)             url.searchParams.set('overwrite',             'true');
        if (opts.aclConflict)           url.searchParams.set('aclConflict',           opts.aclConflict);
        if (opts.autoPartitionConflict) url.searchParams.set('autoPartitionConflict', opts.autoPartitionConflict);

        const body = fs.createReadStream(srcPath);

        let sent = 0;
        body.on('data', chunk => {
          sent += chunk.length;
          if (opts.cb) opts.cb({ type: 'cas', current: sent, total: sent });
        });

        const res = await self._fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/gzip' },
          body,
          duplex: 'half',
        });

        return res.json();
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
