import {BaseService} from '@ucd-lib/cork-app-utils';
import DirectoryStore from '../stores/DirectoryStore.js';

import payload from '../payload.js';

class DirectoryService extends BaseService {

  constructor() {
    super();
    this.store = DirectoryStore;
  }

  get baseUrl(){
    return '/api/dir';
  }

  async list(path){
    let ido = {path};
    let id = payload.getKey(ido);
    const store = this.store.data.list;

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}${path}`,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          payload.generate(ido, resp),
          store
        )
      })
    );

    return store.get(id);
  }

  async deleteFile(path, options={}) {
    let ido = { path, ...options };
    let id = payload.getKey(ido);
    const store = this.store.data.deleteFile;

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}${path}`,
        qs: options,
        fetchOptions: { method: 'DELETE' },
        onUpdate : resp => this.store.set(
          payload.generate(ido, resp),
          store
        )
      })
    );

    return store.get(id);
  }

}

const service = new DirectoryService();
export default service;