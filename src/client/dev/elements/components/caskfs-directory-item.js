import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-directory-item.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import './caskfs-delete-form.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import FsDisplayUtils from '../../utils/FsDisplayUtils.js';

export default class CaskfsDirectoryItem extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      data: { type: Object },
      fsUtils: { state: true },
      hideSelect: { type: Boolean, attribute: 'hide-select' }
    };
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.data = {};
    this.hideSelect = false;
    this.selectCtl = new DirectoryItemSelectController(this, {hostDataProperty: 'data'});

    this._injectModel('AppStateModel');
  }

  willUpdate(props){
    if ( props.has('data') ) {
      this.fsUtils = new FsDisplayUtils(this.data);
    }
  }

  _onItemClick() {
    // not sure if this should be a button with an event or just a plain link - sp
    this.dispatchEvent(new CustomEvent('item-click', {
      detail: {
        data: this.data,
        selected: this.selectCtl.hostIsSelected,
        isDirectory: this.fsUtils.isDirectory
      }
    }));
    this.renderRoot.activeElement?.blur();
  }

  _onDeleteClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-delete-form .items=${this.data}></caskfs-delete-form>`,
    });
  }

}

customElements.define('caskfs-directory-item', CaskfsDirectoryItem);