import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-page-relationships.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

import '../components/caskfs-file-preview.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

export default class CaskfsPageRelationships extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      metadata: { type: Object },
      filters: { type: Array }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.metadata = {};
    this.filters = [
      { value: 'subject', label: 'Subject' },
      { value: 'predicate', label: 'Predicate', multiple: true },
      { value: 'ignorePredicate', label: 'Ignore Predicate', multiple: true },
      { value: 'graph', label: 'Graph' }
    ];

    this.ctl = {
      appComponent: new AppComponentController(this),
      directoryPath: new DirectoryPathController(this)
    };

    this._injectModel('AppStateModel', 'FsModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.getMetadata();
  }

  _onFileSelect(e) {
    if ( e.detail?.suggestion.isDirectory ) return;
    this.AppStateModel.setLocation(appUrlUtils.fullLocation(`/rel${e.detail.suggestion.metadata.filepath}`));
  }

  async getMetadata() {
    this.metadata = {};
    if ( this.ctl.directoryPath.emptyOrRoot ) return;
    const res = await this.FsModel.getMetadata(this.ctl.directoryPath.pathname);
    if ( res.state === 'loaded' ) {
      this.metadata = res.payload;
    }
  }

  _onDisplayFileClick(){
    this.AppStateModel.showDialogModal({
      title: this.metadata.filename,
      actions: [{text: 'Close', value: 'dismiss', invert: true, color: 'secondary'}],
      fullWidth: true,
      content: () => html`
        <caskfs-file-preview
          filepath=${this.metadata.filepath}
        ></caskfs-file-preview>`
    });
  }

  _onCopyPathClick() {
    navigator.clipboard.writeText(this.ctl.directoryPath.pathname);
    this.AppStateModel.showToast({text: 'File system path copied to clipboard', type: 'success'});
  }

  _onPartitionRemoved(){
    this.AppStateModel.showToast({text: 'Partition removed', type: 'success'});
  }

}

customElements.define('caskfs-page-relationships', CaskfsPageRelationships);