import { LitElement } from 'lit';
import {render, styles} from "./caskfs-file-metadata.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import Prism from 'prismjs';
import 'prismjs/components/prism-json.js';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import AppComponentController from '../../controllers/AppComponentController.js';
import FsDisplayUtils from '../../utils/FsDisplayUtils.js';

export default class CaskfsFileMetadata extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      data: { type: Object },
      highlightedData: { state: true },
      fsUtils: { state: true },
      showRaw: { type: Boolean, attribute: 'show-raw' }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.data = {};
    this.highlightedData = '';
    this.showRaw = false;

    this.appComponentCtl = new AppComponentController(this);
    this.directoryPathCtl = new DirectoryPathController(this);

    this._injectModel('AppStateModel', 'FsModel');
  }

  willUpdate(props){
    if (props.has('data')) {
      this.fsUtils = new FsDisplayUtils(this.data);
      try {
        this.highlightedData = Prism.highlight(
          JSON.stringify(this.data, null, 2), 
          Prism.languages.json, 
          'json'
        );
      } catch(e) {
        this.highlightedData = '';
      }
    }
  }

  async _onAppStateUpdate(e) {
    if ( !this.appComponentCtl.isOnActivePage ) return;
    this.getMetadata();
  }

  async getMetadata() {
    this.data = {};
    const res = await this.FsModel.getMetadata(this.directoryPathCtl.pathname);
    if ( res.state === 'loaded' ) {
      this.data = res.payload;
    }
  }

}

customElements.define('caskfs-file-metadata', CaskfsFileMetadata);