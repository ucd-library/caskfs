import { LruStore } from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class AuditStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      log: new LruStore({name: 'audit.log'})
    };
    this.events = {};
  }

}

const store = new AuditStore();
export default store;
