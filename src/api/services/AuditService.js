import {BaseService, digest} from '@ucd-lib/cork-app-utils';
import AuditStore from '../stores/AuditStore.js';

import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';
import serviceUtils from '../utils/serviceUtils.js';

class AuditService extends BaseService {

  constructor() {
    super();
    this.store = AuditStore;
  }

  get baseUrl(){
    return `${appUrlUtils.basePath}/api/audit`;
  }

  /**
   * @description Get the full audit history for one file or directory, oldest first, via
   * GET /audit/log/*. Requires write permission on the resource - not read or admin.
   * @param {String} path - resource path (file or directory)
   * @param {Boolean} [isFile=false] - true if path names a file, false for a directory
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>} store record whose payload is {entries: Array<Object>}
   */
  async getLog(path, isFile=false, modelAppStateOptions={}) {
    let ido = { path, isFile };
    let id = await digest(ido);
    const store = this.store.data.log;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to get audit history'} },
      modelAppStateOptions
    );

    const qs = {};
    if ( isFile ) qs.isFile = true;

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/log${path}`,
        qs,
        parseResponseJson: true,
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

const service = new AuditService();
export default service;
