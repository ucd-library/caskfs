import {BaseService} from '@ucd-lib/cork-app-utils';
import DirectoryStore from '../stores/DirectoryStore.js';

import payload from '../utils/payload.js';
import appPathUtils from '../../client/dev/utils/appPathUtils.js';

class DirectoryService extends BaseService {

  constructor() {
    super();
    this.store = DirectoryStore;
  }

  get baseUrl(){
    return `${appPathUtils.basePath}/api/dir`;
  }

  async list(path){
    let ido = {path};
    let id = payload.getKey(ido);
    const store = this.store.data.list;

    const appStateOptions = {
      errorSettings: {message: 'Unable to list directory contents'}
    }

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

const service = new DirectoryService();
export default service;