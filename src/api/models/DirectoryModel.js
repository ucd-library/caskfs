import {BaseModel} from '@ucd-lib/cork-app-utils';
import DirectoryService from '../services/DirectoryService.js';
import DirectoryStore from '../stores/DirectoryStore.js';

class DirectoryModel extends BaseModel {

  constructor() {
    super();

    this.store = DirectoryStore;
    this.service = DirectoryService;
      
    this.register('DirectoryModel');
    this.inject('FsModel');
  }

  list(path, appStateOptions={}) {
    if ( !path ) {
      path = '/';
    }
    return this.service.list(path, appStateOptions);
  }

}

const model = new DirectoryModel();
export default model;