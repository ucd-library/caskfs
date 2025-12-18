import {BaseService} from '@ucd-lib/cork-app-utils';
import FsStore from '../stores/FsStore.js';

import payload from '../utils/payload.js';
import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';

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

  async getMetadata(path) {
    let ido = { path };
    let id = payload.getKey(ido);
    const store = this.store.data.metadata;

    const appStateOptions = {
      errorSettings: {message: 'Unable to get file metadata'}
    };

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

  async getFileContents(path) {
    let ido = { path };
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