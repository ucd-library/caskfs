import {LruStore} from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class FsStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      delete: new LruStore({name: 'fs.delete'}),
      metadata: new LruStore({name: 'fs.metadata'}),
      fileContents: new LruStore({name: 'fs.fileContents', maxSize: 10})
    };
    this.events = {};
  }

}

const store = new FsStore();
export default store;