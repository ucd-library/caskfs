import {BaseModel} from '@ucd-lib/cork-app-utils';
import LdService from '../services/LdService.js';
import LdStore from '../stores/LdStore.js';

class LdModel extends BaseModel {

  constructor() {
    super();

    this.store = LdStore;
    this.service = LdService;
      
    this.register('LdModel');
  }

  rel(path, query) {
    return this.service.rel(path, query);
  }

  find(query) {
    return this.service.find(query);
  }

  suggestUri(q, limit, appStateOptions) {
    return this.service.suggestUri(q, limit, appStateOptions);
  }

  suggestPartitionKey(q, limit, appStateOptions) {
    return this.service.suggestPartitionKey(q, limit, appStateOptions);
  }

}

const model = new LdModel();
export default model;