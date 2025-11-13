import {BaseModel} from '@ucd-lib/cork-app-utils';
import AutoPathService from '../services/AutoPathService.js';
import AutoPathStore from '../stores/AutoPathStore.js';

class AutoPathModel extends BaseModel {

  constructor() {
    super();

    this.store = AutoPathStore;
    this.service = AutoPathService;
      
    this.register('AutoPathModel');
  }

  async list(type) {
    return this.service.list(type);
  }

}

const model = new AutoPathModel();
export default model;