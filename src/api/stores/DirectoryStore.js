import {LruStore} from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class DirectoryStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      list: new LruStore({name: 'directory.list'})
    };
    this.events = {
      DIRECTORY_ITEM_SELECT_UPDATE: 'directory-item-select-update',
      DIRECTORY_ITEM_SELECT_ALL: 'directory-item-select-all'
    };
    this.selectedItems = [];
  }

}

const store = new DirectoryStore();
export default store;