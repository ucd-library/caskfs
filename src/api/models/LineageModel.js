import {BaseModel} from '@ucd-lib/cork-app-utils';
import LineageService from '../services/LineageService.js';
import LineageStore from '../stores/LineageStore.js';
import clearCache from '../utils/clearCache.js';

class LineageModel extends BaseModel {

  constructor() {
    super();

    this.store = LineageStore;
    this.service = LineageService;

    this.register('LineageModel');
  }

  getSources(path, query={}, appStateOptions={}) {
    return this.service.getSources(path, query, appStateOptions);
  }

  getDerivatives(path, query={}, appStateOptions={}) {
    return this.service.getDerivatives(path, query, appStateOptions);
  }

  async addLink(fromPath, sourcePath, opts={}, appStateOptions={}) {
    const res = await this.service.addLink(fromPath, sourcePath, opts, appStateOptions);
    if ( res.state === 'loaded' ) {
      clearCache();
    }
    return res;
  }

  async removeLink(fromPath, sourcePath, opts={}, appStateOptions={}) {
    const res = await this.service.removeLink(fromPath, sourcePath, opts, appStateOptions);
    if ( res.state === 'loaded' ) {
      clearCache();
    }
    return res;
  }

}

const model = new LineageModel();
export default model;
