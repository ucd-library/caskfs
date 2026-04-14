import { LitElement } from 'lit';
import {render, styles} from "./caskfs-upload-tracker-toggle.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

export default class CaskfsUploadTrackerToggle extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      trackerVisible: { state: true },
      uploadInProgress: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.trackerVisible = false;
    this.uploadInProgress = false;

    this._injectModel('FsModel');
  }

  willUpdate(props){
    if ( props.has('trackerVisible') ){
      this.trackerVisible ? this.FsModel.showUploadTracker() : this.FsModel.hideUploadTracker();
    }
  }

  _onFsUploadTrackerVisibilityUpdate(e){
    this.trackerVisible = e.visible;
  }

  _onFsUploadProgressUpdate(e) {
    if ( e.entityType !== 'entry' ) return;
    this.uploadInProgress = e.entity.state === 'loading' || this.FsModel.uploadInProgress;
  }

}

customElements.define('caskfs-upload-tracker-toggle', CaskfsUploadTrackerToggle);