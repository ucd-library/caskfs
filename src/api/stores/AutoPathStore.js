import {LruStore} from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class AutoPathStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      list: new LruStore({name: 'autopath.list'})
    };
    this.events = {};
  }

}

const store = new AutoPathStore();
export default store;