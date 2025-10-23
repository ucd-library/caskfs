import {BaseModel} from '@ucd-lib/cork-app-utils';
import SystemService from '../services/SystemService.js';
import SystemStore from '../stores/SystemStore.js';

class SystemModel extends BaseModel {

  constructor() {
    super();

    this.store = SystemStore;
    this.service = SystemService;
      
    this.register('SystemModel');
  }

  stats() {
    return this.service.stats();
  }

}

const model = new SystemModel();
export default model;