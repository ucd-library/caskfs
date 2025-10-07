import {BaseModel} from '@ucd-lib/cork-app-utils';
import DirectoryService from '../services/DirectoryService.js';
import DirectoryStore from '../stores/DirectoryStore.js';

class DirectoryModel extends BaseModel {

  constructor() {
    super();

    this.store = DirectoryStore;
    this.service = DirectoryService;
      
    this.register('DirectoryModel');
  }

  list(path) {
    if ( !path ) {
      path = '/';
    }
    return this.service.list(path);
  }

  async deleteFile(path, options={}) {
    const res = await this.service.deleteFile(path, options);
    if ( res.state === 'loaded' ) {
      this.purgeCache();
    }
    return res;
  }

  purgeCache(){
    this.store.data.list.purge();
  }

}

const model = new DirectoryModel();
export default model;