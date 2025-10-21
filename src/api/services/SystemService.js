import {BaseService} from '@ucd-lib/cork-app-utils';
import SystemStore from '../stores/SystemStore.js';

import payload from '../utils/payload.js';

class SystemService extends BaseService {

  constructor() {
    super();
    this.store = SystemStore;
  }

  async stats(){
    let ido = {action: 'stats'};
    let id = payload.getKey(ido);
    const store = this.store.data.stats;

    const appStateOptions = {
      errorSettings: {message: 'Unable to get system stats'}
    };

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `/api/system/stats`,
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

const service = new SystemService();
export default service;