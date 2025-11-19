import { LitElement } from 'lit';
import {render, styles} from "./caskfs-partition-toggle.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

export default class CaskfsPartitionToggle extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      partitions: { type: Array },
      _partitions: { type: Array  }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.partitions = [];
    this._partitions = [];

    this.ctl = {
      qs: new QueryStringController(this, { types: { partition: 'array' } }),
      appComponent: new AppComponentController(this)
    };

    this._injectModel('AppStateModel');
  }

  willUpdate(props){
    if ( props.has('partitions') ) {
      this.setPartitionsList();
    }
  }

  async _onAppStateUpdate(){
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.ctl.qs.updateComplete;
    this.setPartitionsList();
  }

  setPartitionsList(){
    this._partitions = this.partitions.map(p => ({
      name: p,
      applied: this.ctl.qs.query.partition.includes(p)
    }));
  }

  togglePartition(partition){
    const { name, applied } = partition;
    if ( applied ) {
      this.ctl.qs.query.partition = this.ctl.qs.query.partition.filter(p => p !== name);
      this.AppStateModel.showToast({ 
        text: `Partition removed`,
        type: 'success' 
      });
    } else {
      this.ctl.qs.query.partition.push(name);
      this.AppStateModel.showToast({ 
        text: `Partition applied`,
        type: 'success' 
      });
    }
    this.ctl.qs.deleteParam('page');
    this.ctl.qs.setLocation();
  }

}

customElements.define('caskfs-partition-toggle', CaskfsPartitionToggle);