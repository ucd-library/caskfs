import { LitElement } from 'lit';
import {render} from "./caskf-system-stats.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';

export default class CaskfSystemStats extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      stats: { type: Object }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.stats = {};

    this.ctl = {
      appComponent: new AppComponentController(this)
    };

    this._injectModel('AppStateModel', 'SystemModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.getStats();
  }

  async getStats() {
    this.stats = {};
    const res = await this.SystemModel.stats();
    if ( res.state === 'loaded' ) {
      this.stats = res.payload;
    }
  }

}

customElements.define('caskf-system-stats', CaskfSystemStats);