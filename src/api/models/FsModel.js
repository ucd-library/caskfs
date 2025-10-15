import {BaseModel} from '@ucd-lib/cork-app-utils';
import FsService from '../services/FsService.js';
import FsStore from '../stores/FsStore.js';

class FsModel extends BaseModel {

  constructor() {
    super();

    this.store = FsStore;
    this.service = FsService;
      
    this.register('FsModel');

    this.inject('DirectoryModel');
  }

  async delete(path, options={}) {
    const res = await this.service.delete(path, options);
    if ( res.state === 'loaded' ) {
      this.purgeCache();
    }
    return res;
  }

  getMetadata(path) {
    return this.service.getMetadata(path);
  }

  purgeCache(noDirPurge) {
    if ( !noDirPurge ) this.DirectoryModel.purgeCache(true);
    this.store.data.metadata.purge();
  }

}

const model = new FsModel();
export default model;