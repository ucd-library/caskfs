import {BaseService, digest} from '@ucd-lib/cork-app-utils';
import LineageStore from '../stores/LineageStore.js';

import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';
import serviceUtils from '../utils/serviceUtils.js';

class LineageService extends BaseService {

  constructor() {
    super();
    this.store = LineageStore;
  }

  get baseUrl(){
    return `${appUrlUtils.basePath}/api/lineage`;
  }

  /**
   * @description Get files that the file at `path` was derived from (its lineage ancestors).
   * @param {String} path - file path
   * @param {Object} query
   * @param {String} [query.relation] - filter by relation URI
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  getSources(path, query={}, modelAppStateOptions={}) {
    return this._getLinks('sources', path, query, modelAppStateOptions);
  }

  /**
   * @description Get files that were derived from the file at `path`.
   * @param {String} path - file path
   * @param {Object} query
   * @param {String} [query.relation] - filter by relation URI
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  getDerivatives(path, query={}, modelAppStateOptions={}) {
    return this._getLinks('derivatives', path, query, modelAppStateOptions);
  }

  async _getLinks(kind, path, query={}, modelAppStateOptions={}) {
    let ido = { path, kind, ...query };
    let id = await digest(ido);
    const store = this.store.data[kind];

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: `Unable to retrieve lineage ${kind}`} },
      modelAppStateOptions
    );

    const qs = {};
    if ( query.relation ) qs.relation = query.relation;

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/${kind}${path}`,
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

  /**
   * @description Record that fromPath was derived from sourcePath.
   * @param {String} fromPath - path of the derivative file
   * @param {String} sourcePath - path of the source file
   * @param {Object} opts
   * @param {String} [opts.relation]
   * @param {String} [opts.metadata]
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async addLink(fromPath, sourcePath, opts={}, modelAppStateOptions={}) {
    const body = { fromPath, sourcePath, relation: opts.relation, metadata: opts.metadata };
    let id = await digest(body);
    const store = this.store.data.addLink;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to add lineage link'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/add`,
        json: true,
        fetchOptions: { method: 'POST', body },
        parseResponseJson: true,
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

  /**
   * @description Remove a derivative link between fromPath and sourcePath.
   * @param {String} fromPath - path of the derivative file
   * @param {String} sourcePath - path of the source file
   * @param {Object} opts
   * @param {String} [opts.relation]
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async removeLink(fromPath, sourcePath, opts={}, modelAppStateOptions={}) {
    const body = { fromPath, sourcePath, relation: opts.relation };
    let id = await digest(body);
    const store = this.store.data.removeLink;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to remove lineage link'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/remove`,
        json: true,
        fetchOptions: { method: 'POST', body },
        parseResponseJson: true,
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

const service = new LineageService();
export default service;
