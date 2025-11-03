import { LruStore } from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class LdStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      rel: new LruStore({name: 'ld.rel'})
    };
    this.events = {};
  }

}

const store = new LdStore();
export default store;