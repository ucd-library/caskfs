import { Readable, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const pipelineAsync = promisify(pipeline);

/**
 * @class HttpCaskFsClient
 * @description HTTP-based client that mirrors the CaskFs interface for CLI use.
 * Makes fetch() calls to a running CaskFS HTTP server instead of connecting
 * directly to PostgreSQL and the filesystem.
 *
 * This client covers methods that have corresponding HTTP endpoints.
 * Operations without endpoints (admin, individual auto-path rule set/remove/list, archive)
 * throw a descriptive error directing the user to use direct-pg mode. Bulk auto-path rule
 * loading (loadAutoPathRules/loadAutoPathRulesFromFile) and auto-path testing
 * (autoPath[type].getFromPath) are supported over HTTP via admin-only endpoints. Testing a URI
 * against the Linked Data Harvesting Configuration (rdf.testHarvest) is also admin-only. ACL
 * management (users, roles, directory permissions) is fully supported over HTTP via the
 * /acl endpoints - see the ACL methods section below.
 */
class HttpCaskFsClient {

  /**
   * @param {Object} opts
   * @param {String} opts.host - CaskFS server host including protocol (e.g. http://localhost:3000)
   * @param {String} [opts.path=/api] - API path prefix on the server (e.g. /api)
   * @param {String} [opts.token] - Bearer token for authentication. Overridden at
   * request time by the CASKFS_HTTP_TOKEN env var, if set (see _authHeaders).
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
   * The CASKFS_HTTP_TOKEN env var, if set, overrides opts.token on every call -
   * this lets deployments swap the token (e.g. for a service account) without
   * touching application config or recreating the client.
   * @returns {Object}
   */
  _authHeaders() {
    const token = process.env.CASKFS_HTTP_TOKEN || this.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
      redirect: 'manual'
    });


    if (!res.ok) {
      let data;
      try { data = await res.json(); } catch(e) { data = {}; }

      if( !data.message && res.status > 300 && res.status < 400 && res.headers.get('location') ) {
        data.message = `Redirected to ${res.headers.get('location')}.  Authentication may be required.`;
      }

      const err = new Error(`${opts.method || 'GET'} ${url}\nHTTP ${res.status}: ${res.statusText}\n${data.message || JSON.stringify(data)}`);
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
   * @param {Boolean} [opts.deleteLineage] also delete all downstream lineage-derivative files, recursively
   * @returns {Promise<Object>}
   */
  async deleteFile(opts={}) {
    const { filePath, softDelete, deleteLineage } = opts;
    const url = new URL(`${this.baseUrl}/fs${filePath}`);
    if (softDelete) url.searchParams.set('softDelete', 'true');
    if (deleteLineage) url.searchParams.set('deleteLineage', 'true');
    const res = await this._fetch(url.toString(), { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method deleteDirectory
   * @description Delete a directory and all its contents.
   * @param {Object} opts
   * @param {String} opts.directory
   * @param {Boolean} [opts.softDelete]
   * @param {Boolean} [opts.deleteLineage] also delete all downstream lineage-derivative files of every file removed, recursively
   * @returns {Promise<Object>}
   */
  async deleteDirectory(opts={}) {
    const { directory, softDelete, deleteLineage } = opts;
    const url = new URL(`${this.baseUrl}/fs${directory}`);
    url.searchParams.set('directory', 'true');
    if (softDelete) url.searchParams.set('softDelete', 'true');
    if (deleteLineage) url.searchParams.set('deleteLineage', 'true');
    const res = await this._fetch(url.toString(), { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method createDirectory
   * @description Create a new empty directory, and any missing parent directories, via POST /dir/*.
   * @param {Object} opts
   * @param {String} opts.directory
   * @returns {Promise<Object>}
   */
  async createDirectory(opts={}) {
    const { directory } = this._extract(opts);
    const res = await this._fetch(`${this.baseUrl}/dir${directory}`, { method: 'POST' });
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
    const res = await this._fetch(`${this.baseUrl}/fs/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    return res.json();
  }

  /**
   * @method copy
   * @description Copy a file or directory within CaskFS via the HTTP server.
   * Metadata-only operation — the CAS layer is not touched.
   * For a single file returns the written file descriptor; for a directory
   * returns { copied, errors }.
   *
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath - source path
   * @param {Object} opts
   * @param {String} opts.destPath - destination path
   * @param {Boolean} [opts.copyMetadata=false]
   * @param {Boolean} [opts.copyPartitions=false]
   * @param {Boolean} [opts.replace=false]
   * @returns {Promise<Object>}
   */
  async copy(context, opts={}) {
    const { filePath } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/fs/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        srcPath:        filePath,
        destPath:       opts.destPath,
        copyMetadata:   opts.copyMetadata   || false,
        copyPartitions: opts.copyPartitions || false,
        replace:        opts.replace        || false,
      }),
    });
    return res.json();
  }

  /**
   * @method move
   * @description Rename or move a file or directory within CaskFS via the HTTP server
   * (cask: → cask: only). Preserves file_id/directory_id — only the path changes.
   *
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath - source path
   * @param {Object} opts
   * @param {String} opts.destPath - destination path
   * @returns {Promise<Object>}
   */
  async move(context, opts={}) {
    const { filePath } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/fs/mv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        srcPath:  filePath,
        destPath: opts.destPath,
      }),
    });
    return res.json();
  }

  /**
   * @method addDerivativeLink
   * @description Record that one file was derived from another via the HTTP server.
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath - path of the derivative file
   * @param {Object} opts
   * @param {String} opts.sourcePath - path of the source file
   * @param {String} [opts.relation]
   * @param {String} [opts.metadata]
   * @returns {Promise<Object>}
   */
  async addDerivativeLink(context, opts={}) {
    const { filePath } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/lineage/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPath:   filePath,
        sourcePath: opts.sourcePath,
        relation:   opts.relation,
        metadata:   opts.metadata,
      }),
    });
    return res.json();
  }

  /**
   * @method removeDerivativeLink
   * @description Remove a derivative link between two files via the HTTP server.
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath - path of the derivative file
   * @param {Object} opts
   * @param {String} opts.sourcePath - path of the source file
   * @param {String} [opts.relation]
   * @returns {Promise<Object>}
   */
  async removeDerivativeLink(context, opts={}) {
    const { filePath } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/lineage/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPath:   filePath,
        sourcePath: opts.sourcePath,
        relation:   opts.relation,
      }),
    });
    return res.json();
  }

  /**
   * @method getDerivatives
   * @description Get files that were derived from this file via the HTTP server.
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath
   * @param {Object} [opts={}]
   * @param {String} [opts.relation]
   * @returns {Promise<Array>}
   */
  async getDerivatives(context, opts={}) {
    const { filePath } = this._extract(context);
    const url = new URL(`${this.baseUrl}/lineage/derivatives${filePath}`);
    if (opts.relation) url.searchParams.set('relation', opts.relation);
    const res = await this._fetch(url.toString());
    return res.json();
  }

  /**
   * @method getSources
   * @description Get the files this file was derived from via the HTTP server.
   * @param {Object} context - CaskFSContext or plain opts object
   * @param {String} context.filePath
   * @param {Object} [opts={}]
   * @param {String} [opts.relation]
   * @returns {Promise<Array>}
   */
  async getSources(context, opts={}) {
    const { filePath } = this._extract(context);
    const url = new URL(`${this.baseUrl}/lineage/sources${filePath}`);
    if (opts.relation) url.searchParams.set('relation', opts.relation);
    const res = await this._fetch(url.toString());
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

  /**
   * @method loadAutoPathRulesFromFile
   * @description Read a local JSON file of auto-path rules and apply it via the HTTP server's
   * admin-only bulk-load endpoint. Mirrors CaskFs#loadAutoPathRulesFromFile for CLI drop-in use.
   *
   * @param {String} filePath path to a local JSON file (see docs/auto-path.md for the shape)
   * @returns {Promise<Array<{name: String, type: String, updated: Boolean}>>}
   */
  async loadAutoPathRulesFromFile(filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const data = JSON.parse(await fs.promises.readFile(resolved, 'utf-8'));
    return this.loadAutoPathRules(data);
  }

  /**
   * @method loadAutoPathRules
   * @description Apply a batch of auto-path rules via the HTTP server's admin-only bulk-load
   * endpoint. See CaskFs#loadAutoPathRules for the data shape and semantics.
   *
   * @param {Object} data object with optional `bucket`/`partition` arrays of rule objects
   * @returns {Promise<Array<{name: String, type: String, updated: Boolean}>>}
   */
  async loadAutoPathRules(data) {
    const res = await this._fetch(`${this.baseUrl}/auto-path/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    return body.results;
  }

  // ---------------------------------------------------------------------------
  // ACL methods
  // ---------------------------------------------------------------------------

  /**
   * @method getWhoAmI
   * @description Report the caller's own identity via GET /acl/whoami - no admin required.
   * @returns {Promise<{username: String|null, roles: Array<String>, isAdmin: Boolean}>}
   */
  async getWhoAmI() {
    const res = await this._fetch(`${this.baseUrl}/acl/whoami`);
    return res.json();
  }

  /**
   * @method getDirectoryAcl
   * @description Get the ACL for a directory, including inherited permissions, via
   * GET /acl/directory/*. Wraps the result in a single-element array (or returns null for a
   * nonexistent directory) to match CaskFs#getDirectoryAcl's direct-pg return shape.
   *
   * @param {Object|CaskFSContext} context context or object with filePath property
   * @param {String} context.filePath directory path to get the ACL for
   * @returns {Promise<Array<Object>|null>}
   */
  async getDirectoryAcl(context={}) {
    const { filePath } = this._extract(context);
    try {
      const res = await this._fetch(`${this.baseUrl}/acl/directory${filePath}`);
      return [await res.json()];
    } catch(e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  /**
   * @method setDirectoryPublic
   * @description Set or clear the public-read flag for a directory via PUT /acl/directory/*\/public.
   * Directory-scoped admin only (or global admin).
   *
   * @param {Object|CaskFSContext} context context or object with directory/permission properties
   * @param {String} context.directory directory path
   * @param {Boolean|String} context.permission true/false or 'true'/'false'
   * @returns {Promise<Object>}
   */
  async setDirectoryPublic(context={}) {
    const { directory, permission } = this._extract(context);
    const isPublic = permission === true || permission === 'true';
    const res = await this._fetch(`${this.baseUrl}/acl/directory${directory}/public`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public: isPublic }),
    });
    return res.json();
  }

  /**
   * @method setDirectoryPermission
   * @description Grant a principal (a role or a user) a permission on a directory via
   * POST /acl/directory/*\/permissions. Directory-scoped admin only (or global admin).
   *
   * @param {Object|CaskFSContext} context context or object with directory/principal/permission properties
   * @param {String} context.directory directory path
   * @param {String} context.principal role name or username, per context.principalType
   * @param {String} [context.principalType='role'] 'role' or 'user'
   * @param {String} context.permission 'read' | 'write' | 'admin'
   * @returns {Promise<Object>}
   */
  async setDirectoryPermission(context={}) {
    const { directory, principal, principalType, permission } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/directory${directory}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal, principalType, permission }),
    });
    return res.json();
  }

  /**
   * @method removeDirectoryPermission
   * @description Revoke a principal's (a role's or a user's) permission on a directory via
   * DELETE /acl/directory/*\/permissions. Directory-scoped admin only (or global admin).
   *
   * @param {Object|CaskFSContext} context context or object with directory/principal/permission properties
   * @returns {Promise<Object>}
   */
  async removeDirectoryPermission(context={}) {
    const { directory, principal, principalType, permission } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/directory${directory}/permissions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal, principalType, permission }),
    });
    return res.json();
  }

  /**
   * @method removeDirectoryAcl
   * @description Remove a directory's own ACL entirely via DELETE /acl/directory/*; it (and any
   * children without their own explicit ACL) will inherit from the nearest ancestor that has one.
   * Directory-scoped admin only (or global admin).
   *
   * @param {Object|CaskFSContext} context context or object with directory property
   * @returns {Promise<Object>}
   */
  async removeDirectoryAcl(context={}) {
    const { directory } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/directory${directory}`, { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method ensureUser
   * @description Ensure a user exists via POST /acl/users, creating it if needed. Global admin only.
   * @param {Object|CaskFSContext} context context or object with user property
   * @returns {Promise<Object>}
   */
  async ensureUser(context={}) {
    const { user } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    });
    return res.json();
  }

  /**
   * @method removeUser
   * @description Remove a user and all of their role assignments via DELETE /acl/users/:user.
   * Global admin only.
   * @param {Object|CaskFSContext} context context or object with user property
   * @returns {Promise<Object>}
   */
  async removeUser(context={}) {
    const { user } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/users/${encodeURIComponent(user)}`, { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method ensureRole
   * @description Ensure a role exists via POST /acl/roles, creating it if needed. Global admin only.
   * @param {Object|CaskFSContext} context context or object with role property
   * @returns {Promise<Object>}
   */
  async ensureRole(context={}) {
    const { role } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    return res.json();
  }

  /**
   * @method removeRole
   * @description Remove a role and all of its user assignments and directory permissions via
   * DELETE /acl/roles/:role. Global admin only.
   * @param {Object|CaskFSContext} context context or object with role property
   * @returns {Promise<Object>}
   */
  async removeRole(context={}) {
    const { role } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/roles/${encodeURIComponent(role)}`, { method: 'DELETE' });
    return res.json();
  }

  /**
   * @method _listQueryString
   * @description Build a `?search=&limit=&offset=` query string for the paginated
   * roles/users/membership list endpoints, omitting params that weren't provided.
   * @param {Object} opts
   * @param {String} [opts.search]
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @returns {String} query string, including a leading '?' if non-empty, else ''
   */
  _listQueryString({ search, limit, offset } = {}) {
    const params = new URLSearchParams();
    if ( search !== undefined && search !== null ) params.set('search', search);
    if ( limit !== undefined && limit !== null ) params.set('limit', limit);
    if ( offset !== undefined && offset !== null ) params.set('offset', offset);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * @method getRoles
   * @description List defined roles via GET /acl/roles, optionally filtered/paginated. Global admin only.
   * @param {Object|CaskFSContext} [context] context or object with search/limit/offset properties
   * @returns {Promise<Object>} {total, roles: [{roleId, role, created}]}
   */
  async getRoles(context={}) {
    const { search, limit, offset } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/roles${this._listQueryString({ search, limit, offset })}`);
    return res.json();
  }

  /**
   * @method getUsers
   * @description List defined users via GET /acl/users, optionally filtered/paginated. Global admin only.
   * @param {Object|CaskFSContext} [context] context or object with search/limit/offset properties
   * @returns {Promise<Object>} {total, users: [{userId, user, created}]}
   */
  async getUsers(context={}) {
    const { search, limit, offset } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/users${this._listQueryString({ search, limit, offset })}`);
    return res.json();
  }

  /**
   * @method getRole
   * @description List users assigned to a role via GET /acl/roles/:role/users, optionally
   * filtered/paginated. Global admin only.
   * @param {Object|CaskFSContext} context context or object with role/search/limit/offset properties
   * @returns {Promise<Object>} {total, users: [{userId, user}]}
   */
  async getRole(context={}) {
    const { role, search, limit, offset } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/roles/${encodeURIComponent(role)}/users${this._listQueryString({ search, limit, offset })}`);
    return res.json();
  }

  /**
   * @method getUserRoles
   * @description List roles assigned to a user via GET /acl/users/:user/roles, optionally
   * filtered/paginated. Callers may always look up their own roles; looking up another user's
   * roles requires the global admin role.
   * @param {Object|CaskFSContext} context context or object with user/search/limit/offset properties
   * @returns {Promise<Object>} {total, roles: [roleName]}
   */
  async getUserRoles(context={}) {
    const { user, search, limit, offset } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/users/${encodeURIComponent(user)}/roles${this._listQueryString({ search, limit, offset })}`);
    return res.json();
  }

  /**
   * @method setUserRole
   * @description Assign a role to a user via POST /acl/users/:user/roles, creating either if
   * needed. Global admin only.
   * @param {Object|CaskFSContext} context context or object with user/role properties
   * @returns {Promise<Object>}
   */
  async setUserRole(context={}) {
    const { user, role } = this._extract(context);
    const res = await this._fetch(`${this.baseUrl}/acl/users/${encodeURIComponent(user)}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    return res.json();
  }

  /**
   * @method removeUserRole
   * @description Remove a role from a user via DELETE /acl/users/:user/roles/:role. Global admin only.
   * @param {Object|CaskFSContext} context context or object with user/role properties
   * @returns {Promise<Object>}
   */
  async removeUserRole(context={}) {
    const { user, role } = this._extract(context);
    const res = await this._fetch(
      `${this.baseUrl}/acl/users/${encodeURIComponent(user)}/roles/${encodeURIComponent(role)}`,
      { method: 'DELETE' }
    );
    return res.json();
  }

  /**
   * @method testPermission
   * @description Test whether a user (or the public, if omitted) would have a specific
   * permission on a file or directory, via GET /acl/test. Global admin only.
   *
   * @param {Object|CaskFSContext} context
   * @param {String} context.filePath
   * @param {String} context.permission 'read' | 'write' | 'admin'
   * @param {String} [context.user] target user to evaluate; omit to test public access
   * @param {Boolean} [context.isFile=false]
   * @returns {Promise<Boolean>}
   */
  async testPermission(context={}) {
    const { filePath, permission, user, isFile } = this._extract(context);
    const url = new URL(`${this.baseUrl}/acl/test`);
    url.searchParams.set('filePath', filePath);
    url.searchParams.set('permission', permission);
    if (user) url.searchParams.set('user', user);
    if (isFile) url.searchParams.set('isFile', 'true');
    const res = await this._fetch(url.toString());
    return (await res.json()).hasPermission;
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
        const { predicate, partitionKeys, graph, subject, object, type, updatedAfter, updatedBefore, limit, offset } = opts;
        const url = new URL(`${self.baseUrl}/find`);
        if (predicate)          url.searchParams.set('predicate',     predicate);
        if (subject)            url.searchParams.set('subject',       subject);
        if (object)             url.searchParams.set('object',        object);
        if (graph)              url.searchParams.set('graph',         graph);
        if (type)               url.searchParams.set('type',          type);
        if (updatedAfter)       url.searchParams.set('updatedAfter',  updatedAfter);
        if (updatedBefore)      url.searchParams.set('updatedBefore', updatedBefore);
        if (partitionKeys?.length) url.searchParams.set('partitionKeys', partitionKeys.join(','));
        if (limit  !== undefined) url.searchParams.set('limit',  limit);
        if (offset !== undefined) url.searchParams.set('offset', offset);
        const res = await self._fetch(url.toString());
        return res.json();
      },

      read()    { self._notSupported('ld (rdf read)'); },
      literal() { self._notSupported('literal'); },

      /**
       * @method rdf.testHarvest
       * @description Test a single URI against the server's Linked Data Harvesting
       * Configuration via the admin-only /harvest-test endpoint.
       * @param {String} uri
       * @returns {Promise<Object>} { uri, literal, filter, link }
       */
      async testHarvest(uri) {
        const url = new URL(`${self.baseUrl}/harvest-test`);
        url.searchParams.set('uri', uri);
        const res = await self._fetch(url.toString());
        return res.json();
      },
    };
  }

  _buildAutoPath() {
    const self = this;
    const ns = (name) => () => self._notSupported(`auto-path ${name}`);

    /**
     * @function buildType
     * @description Build the per-type (bucket/partition) auto-path namespace object.
     * @param {String} type 'bucket' or 'partition'
     * @returns {Object}
     */
    const buildType = (type) => ({
      /**
       * @method getFromPath
       * @description Evaluate every configured rule of this type against a file path via the
       * HTTP server's admin-only test endpoint.
       * @param {String} filePath
       * @returns {Promise<Array<Object>>} array of {name, value} objects, one per matching rule
       */
      async getFromPath(filePath) {
        const url = new URL(`${self.baseUrl}/auto-path/${type}/test`);
        url.searchParams.set('filePath', filePath);
        const res = await self._fetch(url.toString());
        return res.json();
      },
      set:       ns('set'),
      remove:    ns('remove'),
      getConfig: ns('list'),
    });

    return { partition: buildType('partition'), bucket: buildType('bucket') };
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
