import { LitElement } from 'lit';
import {render, styles} from "./caskfs-file-preview.tpl.js";
import { LitCorkUtils, Mixin, LruStore } from '@ucd-lib/cork-app-utils';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import AppComponentController from '../../controllers/AppComponentController.js';
import { WaitController } from '@ucd-lib/theme-elements/utils/controllers/wait.js';

import Prism from 'prismjs';
import 'prismjs/components/prism-json.js';

import mimeTypeUtils from '../../utils/mimeTypeUtils.js';
import config from '../../config.js';

/**
 * @description A file preview component that displays certain files in the browser based on their mime type.
 * @property {String} filepath - The path to the file to preview.
 */
export default class CaskfsFilePreview extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      filepath: { type: String },
      metadata: { type: Object },
      fileContents: { type: String}, 
      previewType: { state: true },
      exceedsPreviewThreshold: { state: true },
      loading: { state: true },
      buttonLoader: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.ctl = {
      appComponent: new AppComponentController(this),
      directoryPath: new DirectoryPathController(this),
      wait: new WaitController(this)
    };

    this.previewAnyway = new LruStore({name: 'previewAnyway', maxSize: 50});

    this.filepath = '';
    this.metadata = null;
    this.loading = false;
    this.buttonLoader = false;
    this.previewType = false;
    this.fileContents = '';
    this.exceedsPreviewThreshold = false;

    this._injectModel('FsModel', 'AppStateModel');
  }

  get _filepath() {
    return this.filepath || this.ctl.directoryPath.pathname;
  }

  async _onAppStateUpdate() {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
      this.getData();
    }

  willUpdate(props){
    if ( props.has('filepath') && this.filepath ) {
      this.getData();
    }
  }

  async getData(){
    this.loading = true;
    await this.getMetadata();
    if ( this.previewType && this.previewType !== 'image' ) {
      await this.getFileContents();
    }

    this.loading = false;
  }

  async _onDisplayAnywayClick() {
    this.buttonLoader = true;
    this.previewAnyway.set(this._filepath, true);
    await this.getFileContents({noReset: true});
    this.buttonLoader = false;
    await this.ctl.wait.waitForUpdate();
  }

  async getMetadata() {
    this.metadata = {};
    this.previewType = false;
    const res = await this.FsModel.getMetadata(this._filepath);
    if ( res.state === 'loaded' ) {
      this.metadata = res.payload;
      this.previewType = mimeTypeUtils.previewType(this.metadata?.metadata?.mimeType);
      if ( this.previewType === 'image' ) {
        this.exceedsPreviewThreshold = this.metadata.size > config.previewThresholdImage;
      } else if ( this.previewType === 'text' || this.previewType === 'json' ) {
        this.exceedsPreviewThreshold = this.metadata.size > config.previewThresholdText;
      }
    }
  }

  /**
   * @description Gets file contents for the specified file path. If the file exceeds the preview threshold, only a portion of the file will be fetched
   * @param {Object} opts - options object
   * @param {boolean} opts.noReset - if true, will not reset fileContents to empty string before fetching
   */
  async getFileContents(opts={}) {
    if ( !opts.noReset ) this.fileContents = '';
    let fetchOpts = {};
    if ( this.exceedsPreviewThreshold && !this.previewAnyway.get(this._filepath) ) {
      fetchOpts.rangeStart = 0;
      fetchOpts.rangeEnd = config.previewRangeSize;
    }
    const res = await this.FsModel.getFileContents(this._filepath, fetchOpts);
    if ( res.state === 'loaded' ) {
      if ( this.previewType === 'json' ){

        let rawJson = typeof res.payload === 'string' ? res.payload : JSON.stringify(res.payload);
        try {
          rawJson = JSON.stringify(JSON.parse(rawJson), null, 2);
        } catch(e) {
          // truncated or invalid json — highlight raw string as-is
        }
        this.fileContents = Prism.highlight(rawJson, Prism.languages.json, 'json');
      } else {
        this.fileContents = res.payload;
      }
    }
  }
}

customElements.define('caskfs-file-preview', CaskfsFilePreview);