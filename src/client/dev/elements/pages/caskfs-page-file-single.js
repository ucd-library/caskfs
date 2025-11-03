import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-page-file-single.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

import '../components/caskfs-delete-form.js';
import '../components/caskfs-file-preview.js';

export default class CaskfsPageFileSingle extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      data: { type: Object }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.data = {};

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

  async getMetadata() {
    this.data = {};
    const res = await this.FsModel.getMetadata(this.ctl.directoryPath.pathname);
    if ( res.state === 'loaded' ) {
      this.data = res.payload;
    }
  }

  _onDeleteRequest() {
    this.AppStateModel.showDialogModal({
      content: () => html`
        <caskfs-delete-form 
          .items=${{filepath: this.ctl.directoryPath.pathname}} 
          .successLocation=${this.ctl.directoryPath.breadcrumbParent?.url}>
        </caskfs-delete-form>`
    });
  }

  _onDisplayFileClick(){
    this.AppStateModel.showDialogModal({
      title: this.data.filename,
      fullWidth: true,
      content: () => html`
        <caskfs-file-preview
          filepath=${this.ctl.directoryPath.pathname}
        ></caskfs-file-preview>`
    });
  }

  _onCopyPathClick() {
    navigator.clipboard.writeText(this.ctl.directoryPath.pathname);
    this.AppStateModel.showToast({text: 'File system path copied to clipboard', type: 'success'});
  }

}

customElements.define('caskfs-page-file-single', CaskfsPageFileSingle);