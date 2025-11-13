import {BaseService} from '@ucd-lib/cork-app-utils';
import AutoPathStore from '../stores/AutoPathStore.js';

import payload from '../utils/payload.js';
import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';

class AutoPathService extends BaseService {

  constructor() {
    super();
    this.store = AutoPathStore;
  }

  get baseUrl(){
    return `${appUrlUtils.basePath}/api/auto-path`;
  }

  async list(type){
    let ido = {type};
    let id = payload.getKey(ido);
    const store = this.store.data.list;

    const appStateOptions = {
      errorSettings: {message: 'Unable to list auto-path rules'}
    }

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/${type}`,
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

const service = new AutoPathService();
export default service;