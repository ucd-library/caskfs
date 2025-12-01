import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-partition-status-button.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';

import './caskfs-partition-apply-form.js';

export default class CaskfsPartitionStatusButton extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.ctl = {
      qs: new QueryStringController(this, { types: { partition: 'array' }, alwaysSyncOnAppStateUpdate: true })
    };

    this._injectModel('AppStateModel');
  }

  _onSubmit(e){
    e?.preventDefault();
    const toastMsg = this.ctl.qs.query.partition?.[0] ? 'Partition applied' : 'Partition removed';
    this.AppStateModel.showToast({ text: toastMsg, type: 'success' });
    this.ctl.qs.deleteParam('page');
    this.ctl.qs.setLocation();
  }

  showModalForm(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-partition-apply-form></caskfs-partition-apply-form>`
    });
  }

}

customElements.define('caskfs-partition-status-button', CaskfsPartitionStatusButton);