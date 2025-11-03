import { LitElement } from 'lit';
import {render, styles} from "./caskfs-file-preview.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import Prism from 'prismjs';
import 'prismjs/components/prism-json.js';

import mimeTypeUtils from '../../utils/mimeTypeUtils.js';

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
      loading: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.filepath = '';
    this.metadata = null;
    this.loading = false;
    this.previewType = false;
    this.fileContents = '';

    this._injectModel('FsModel');
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

  async getMetadata() {
    this.metadata = {};
    this.previewType = false;
    const res = await this.FsModel.getMetadata(this.filepath);
    if ( res.state === 'loaded' ) {
      this.metadata = res.payload;
      this.previewType = mimeTypeUtils.previewType(this.metadata?.metadata?.mimeType);
    }
  }

  async getFileContents() {
    this.fileContents = '';
    const res = await this.FsModel.getFileContents(this.filepath);
    if ( res.state === 'loaded' ) {
      if ( this.previewType === 'json' ){
        try {
          this.fileContents = Prism.highlight(
            JSON.stringify(JSON.parse(res.payload), null, 2), 
            Prism.languages.json, 
            'json'
          );
          
        } catch(e) {
          this.fileContents = 'Error parsing JSON file for preview.';
        }
      } else {
        this.fileContents = res.payload;
      }
    }
  }
}

customElements.define('caskfs-file-preview', CaskfsFilePreview);