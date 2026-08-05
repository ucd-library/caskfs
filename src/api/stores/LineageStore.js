import { LruStore } from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class LineageStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      sources: new LruStore({name: 'lineage.sources'}),
      derivatives: new LruStore({name: 'lineage.derivatives'}),
      addLink: new LruStore({name: 'lineage.addLink'}),
      removeLink: new LruStore({name: 'lineage.removeLink'})
    };
    this.events = {};
  }

}

const store = new LineageStore();
export default store;
