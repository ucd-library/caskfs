import {BaseService, digest} from '@ucd-lib/cork-app-utils';
import LdStore from '../stores/LdStore.js';

import appPathUtils from '../../client/dev/utils/appPathUtils.js';

class LdService extends BaseService {

  constructor() {
    super();
    this.store = LdStore;
  }

  get baseUrl(){
    return `${appPathUtils.basePath}/api`;
  }

  async rel(path, query={}) {
    let ido = { path, ...query };
    let id = await digest(ido);
    const store = this.store.data.rel;

    const appStateOptions = {
      errorSettings: {message: 'Unable to retrieve file relationships'}
    };

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/rel${path}`,
        json: true,
        fetchOptions: { 
          method: 'POST',
          body: query
        },
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  async find(query={}) {
    let id = await digest(query);
    const store = this.store.data.find;

    const appStateOptions = {
      errorSettings: {message: 'Unable to perform linked data find query'}
    };

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/find`,
        json: true,
        fetchOptions: { 
          method: 'POST',
          body: query
        },
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

}

const service = new LdService();
export default service;