import {BaseService} from '@ucd-lib/cork-app-utils';
import FsStore from '../stores/FsStore.js';

import payload from '../payload.js';

class FsService extends BaseService {

  constructor() {
    super();
    this.store = FsStore;
  }

  get baseUrl(){
    return '/api/fs';
  }

  async delete(path, options={}) {
    let ido = { path, ...options };
    let id = payload.getKey(ido);
    const store = this.store.data.delete;

    const appStateOptions = {
      errorSettings: {message: 'Unable to delete file'},
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

}

const service = new FsService();
export default service;