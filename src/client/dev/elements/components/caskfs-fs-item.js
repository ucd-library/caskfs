import { LitElement, html } from 'lit';
import {render} from "./caskfs-fs-item.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import './caskfs-delete-form.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import FsDisplayUtils from '../../utils/FsDisplayUtils.js';

export default class CaskfsFsItem extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      data: { type: Object },
      fsUtils: { state: true },
      hideSelect: { type: Boolean, attribute: 'hide-select' },
      showDirectoryLink: { type: Boolean, attribute: 'show-directory-link' },
      hideTypeIcon: { type: Boolean, attribute: 'hide-type-icon' }
    };
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.data = {};
    this.hideSelect = false;
    this.showDirectoryLink = false;
    this.hideTypeIcon = false;
    this.selectCtl = new DirectoryItemSelectController(this, {hostDataProperty: 'data'});

    this._injectModel('AppStateModel');
  }

  willUpdate(props){
    if ( props.has('data') ) {
      this.fsUtils = new FsDisplayUtils(this.data);
    }
  }

  _onDeleteClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-delete-form .items=${this.data}></caskfs-delete-form>`,
    });
  }

}

customElements.define('caskfs-fs-item', CaskfsFsItem);