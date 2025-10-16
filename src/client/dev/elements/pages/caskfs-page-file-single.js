import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-page-file-single.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import DirectoryPathController from '../../controllers/DirectoryPathController.js';

import '../components/caskfs-delete-form.js';

export default class CaskfsPageFileSingle extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

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

    this.directoryPathCtl = new DirectoryPathController(this);

    this._injectModel('AppStateModel', 'FsModel');
  }

  _onDeleteRequest() {
    this.AppStateModel.showDialogModal({
      content: () => html`
        <caskfs-delete-form 
          .items=${{filepath: this.directoryPathCtl.pathname}} 
          .successLocation=${this.directoryPathCtl.breadcrumbParent?.url}>
        </caskfs-delete-form>`,
    });
  }

}

customElements.define('caskfs-page-file-single', CaskfsPageFileSingle);