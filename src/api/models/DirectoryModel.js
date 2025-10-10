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

  list(path) {
    if ( !path ) {
      path = '/';
    }
    return this.service.list(path);
  }

  purgeCache(noFsPurge) {
    if ( !noFsPurge ) this.FsModel.purgeCache(true);
    this.store.data.list.purge();

    // clear any selected items
    this.store.selectedItems = [];
    this.store.emit(this.store.events.DIRECTORY_ITEM_SELECT_UPDATE, {selected: this.store.selectedItems});
  }

}

const model = new DirectoryModel();
export default model;