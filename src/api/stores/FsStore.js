import {LruStore} from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class FsStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      delete: new LruStore({name: 'fs.delete'})
    };
    this.events = {};
  }

}

const store = new FsStore();
export default store;