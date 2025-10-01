import { LitElement } from 'lit';
import {render, styles} from "./caskfs-app.tpl.js";

// theme elements
import '@ucd-lib/theme-elements/brand/ucd-theme-primary-nav/ucd-theme-primary-nav.js';
import '@ucd-lib/theme-elements/brand/ucd-theme-header/ucd-theme-header.js';
import '@ucd-lib/theme-elements/ucdlib/ucdlib-branding-bar/ucdlib-branding-bar.js';
import '@ucd-lib/theme-elements/ucdlib/ucdlib-pages/ucdlib-pages.js';
import '@ucd-lib/theme-elements/brand/ucd-theme-pagination/ucd-theme-pagination.js';

import { Registry, LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

// app pages and components
import './pages/caskfs-page-home.js';
import './pages/caskfs-page-directory.js';
import './pages/caskfs-page-file-search.js';
import './pages/caskfs-page-partitions.js';

// icon elements
import '@ucd-lib/cork-icon';

// cork models
import '../../../api/models/AppStateModel.js';
Registry.ready();

import ScrollController from '../controllers/ScrollController.js';

export default class CaskfsApp extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      page: {type: String},
      _firstAppStateUpdate : { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.page = '';
    this._firstAppStateUpdate = false;

    this._injectModel('AppStateModel');

    this.scrollCtl = new ScrollController(this, {attachListener: true});
  }

  firstUpdated(){
    this.AppStateModel.refresh();
  }

  async _onAppStateUpdate(e) {
    this.logger.info('appStateUpdate', e);
    if ( !this._firstAppStateUpdate ) {
      this._firstAppStateUpdate = true;
      this.hideFullSiteLoader();
    }
    this.closeNav();
    const { page, location } = e;
    this.page = page;
  }

  /**
   * @description Hide the full site loader after a timeout
   * @param {*} timeout
   */
  async hideFullSiteLoader(timeout=300){
    await new Promise(resolve => setTimeout(resolve, timeout));
    document.querySelector('#site-loader').style.display = 'none';
    this.style.display = 'block';
  }

  /**
   * @description Close the app's primary nav menu
   */
  closeNav(){
    let ele = this.renderRoot.querySelector('ucd-theme-header');
    if ( ele ) {
      ele.close();
    }
    ele = this.renderRoot.querySelector('ucd-theme-quick-links');
    if ( ele ) {
      ele.close();
    }
  }

}

customElements.define('caskfs-app', CaskfsApp);