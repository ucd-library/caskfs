import { LruStore } from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class SystemStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      stats: new LruStore({name: 'system.stats'})
    };
    this.events = {};
  }

}

const store = new SystemStore();
export default store;