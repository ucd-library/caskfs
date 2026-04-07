import {BaseService, digest} from '@ucd-lib/cork-app-utils';
import FsStore from '../stores/FsStore.js';

import payload from '../utils/payload.js';
import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';
import uploadUtils from '../../client/dev/utils/uploadUtils.js';
import serviceUtils from '../utils/serviceUtils.js';

class FsService extends BaseService {

  constructor() {
    super();
    this.store = FsStore;
  }

  get baseUrl(){
    return `${appUrlUtils.basePath}/api/fs`;
  }

  async delete(path, options={}) {
    let ido = { path, ...options };
    let id = payload.getKey(ido);
    const store = this.store.data.delete;

    const appStateOptions = {
      errorSettings: {message: `Unable to delete ${options.directory ? 'directory' : 'file'}`},
      loaderSettings: {suppressLoader: true}
    };

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}${path}`,
        qs: options,
        fetchOptions: { method: 'DELETE' },
        onUpdate : resp => this.store.set(
          payload.generate(ido, resp),
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  async getMetadata(path, modelAppStateOptions={}) {
    let ido = { path };
    let id = payload.getKey(ido);
    const store = this.store.data.metadata;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to get file metadata'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}${path}`,
        qs: { metadata: true },
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          payload.generate(ido, resp),
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  async uploadFile(destDir, file, opts = {}) {
    const store = this.store.data.uploadFile;
    const filename = file.filename;
    const id = await digest({ destDir, filename, ...opts });
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const params = new URLSearchParams();
      if (opts.mimeType) params.set('mimeType', opts.mimeType);
      const method = opts.replace ? 'PUT' : 'POST';
      const url = `${this.baseUrl}${uploadUtils.joinPath([destDir, filename], { leadingSlash: true, normalize: true })}?${params.toString()}`;
      xhr.open(method, url);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      // initialize entry in store
      const appStateOptions = {
        errorSettings: {suppressError: true},
        loaderSettings: {suppressLoader: true}
      };
      this.store.set(
        { id, state: 'loading', destDir, filename, opts, completedBytes: 0, totalBytes: file.size }, 
        store,
        null,
        appStateOptions
      ); 

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const entry = store.get(id);
          if ( entry ) {
            const entryProgress = Math.round((e.loaded / e.total) * 100);
            const lastEmittedProgress = Math.round((entry.completedBytes / entry.totalBytes) * 100);
            entry.completedBytes = e.loaded;
            entry.totalBytes = e.total;
            if (entryProgress - lastEmittedProgress >= this.store.uploadProgressThreshold || entryProgress === 100) {
              this.store.emit(this.store.events.FS_UPLOAD_PROGRESS_UPDATE, { entityType: 'file', entity: entry });
            }
          }
        }
      };

      xhr.onload = () => {
        let body = xhr.responseText;
        const entry = store.get(id);
        try {
          body = JSON.parse(body);
        } catch (e) {
          // response is not JSON, ignore
        }

        const badStatus = xhr.status < 200 || xhr.status >= 300;
        if ( badStatus || body?.error ) {
          entry.error = {
            error: true,
            details: body,
            message: badStatus ? 'Invalid status code' : 'Application Error'
          }
          entry.state = 'error';
        } else {
          entry.state = 'loaded';
          entry.payload = body;
        }
        this.store.set(entry, store, null, appStateOptions);
        resolve(entry);
      };

      xhr.onerror = () => {
        const entry = store.get(id);
        entry.error = {
          error: true,
          message: 'Network error'
        }
        entry.state = 'error';
        this.store.set(entry, store, null, appStateOptions);
        resolve(entry);
      }

      xhr.send(file);
    });
  }

  async getFileContents(path, opts) {
    let ido = { path };
    const fetchOptions = {};

    // if range options are provided, add Range header and include in ID for caching
    if ( opts?.rangeStart !== undefined && opts?.rangeEnd !== undefined ) {
      ido.rangeStart = opts.rangeStart;
      ido.rangeEnd = opts.rangeEnd;
      fetchOptions.headers = {
        'Range': `bytes=${opts.rangeStart}-${opts.rangeEnd}`
      };
    }

    let id = payload.getKey(ido);
    const store = this.store.data.fileContents;

    const appStateOptions = {
      errorSettings: {message: 'Unable to get file contents'},
      loaderSettings: {suppressLoader: true}
    };

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}${path}`,
        fetchOptions,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          payload.generate(ido, resp),
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

}

const service = new FsService();
export default service;