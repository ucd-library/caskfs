import {LruStore} from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class DirectoryStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      list: new LruStore({name: 'directory.list'})
    };
    this.events = {};

    this.errorSettings = {
      'directory.list': {
        message: 'Unable to list directory contents'
      }
    }
  }

}

const store = new DirectoryStore();
export default store;