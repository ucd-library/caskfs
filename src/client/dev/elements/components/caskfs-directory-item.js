import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-directory-item.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import './caskfs-delete-form.js';

export default class CaskfsDirectoryItem extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      data: { type: Object },
      hideSelect: { type: Boolean, attribute: 'hide-select' },
      selected: { type: Boolean },
      name: { state: true },
      isDirectory: { state: true },
      kind: { state: true },
      size: { state: true },
      modifiedDate: { state: true },
      modifiedTime: { state: true }
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
    this.selected = false;

    this.setComputedProps();

    this._injectModel('AppStateModel');
  }

  willUpdate(props){
    if ( props.has('data') ) {
      this.setComputedProps();
    }
  }

  setComputedProps() {
    this.name = (this.data?.file_id ? this.data.filename : this.data?.name?.split('/').filter(Boolean).pop()) || '--';
    this.isDirectory = !this.data?.file_id;
    this.kind = this.isDirectory ? 'directory' : this.data?.metadata?.mimeType || 'file';
    this.size = this.isDirectory ? '--' : this.data?.size || '--';
    if ( !isNaN(Number(this.size)) ) {
      const bytes = Number(this.size);
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let i = 0;
      let size = bytes;
      while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
      }
      this.size = `${size.toFixed(2)} ${units[i]}`;
    }
    let modified = new Date(this.data?.modified);
    this.modifiedDate = isNaN(modified.getTime()) ? '--' : modified.toLocaleDateString();
    this.modifiedTime = isNaN(modified.getTime()) ? '--' : modified.toLocaleTimeString();
  }

  _onSelectToggle(e) {
    this.selected = !this.selected;
    this.dispatchEvent(new CustomEvent('select-toggle', {
      detail: {
        selected: this.selected,
        data: this.data
      }
    }));
  }

  _onItemClick() {
    this.dispatchEvent(new CustomEvent('item-click', {
      detail: {
        data: this.data,
        selected: this.selected,
        isDirectory: this.isDirectory
      }
    }));
  }

  _onDeleteClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-delete-form .items=${this.data}></caskfs-delete-form>`,
    });
  }

}

customElements.define('caskfs-directory-item', CaskfsDirectoryItem);