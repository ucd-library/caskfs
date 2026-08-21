import { LitElement } from 'lit';
import {render, styles} from "./caskfs-page-partitions.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';

export default class CaskfsPagePartitions extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      autoPathRuleCt: { type: Number }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.autoPathRuleCt = 0;

    this._injectModel('AppStateModel', 'AutoPathModel');

    this.ctl = {
      appComponent: new AppComponentController(this)
    };
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.getAutoPathRuleCt();
  }

  async getAutoPathRuleCt() {
    this.autoPathRuleCt = 0;
    const res = await this.AutoPathModel.list('partition');
    if ( res.state === 'loaded' ) {
      this.autoPathRuleCt = res.payload.length;
    }
  }

}

customElements.define('caskfs-page-partitions', CaskfsPagePartitions);
