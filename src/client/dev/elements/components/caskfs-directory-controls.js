import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-directory-controls.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import QueryStringController from '../../controllers/QueryStringController.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';

import './caskfs-delete-form.js';
import './caskfs-upload-form.js';

export default class CaskfsDirectoryControls extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      sortOptions: {type: Array },
      sortValue: { type: String },
      sortIsDesc: { type: Boolean }
    };
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.pathStartIndex = 0;

    this.sortOptions = [
      { label: 'Name', value: 'name' },
      { label: 'Last Modified', value: 'lastModified' },
      { label: 'Size', value: 'size' },
      { label: 'Kind', value: 'kind' },
      { label: 'Modified By', value: 'modifiedBy' }
    ];
    this.sortValue = '';
    this.sortIsDesc = false;

    this.directoryPathCtl = new DirectoryPathController(this);
    this.qsCtl = new QueryStringController(this);
    this.itemSelectCtl = new DirectoryItemSelectController(this);

    this._injectModel('AppStateModel');
  }

  _onSortOptionSelect(e){
    this.qsCtl.setParam('sort', e.detail.value);
    if ( e.detail.isDesc ) {
      this.qsCtl.setParam('sortDirection', 'desc');
    } else {
      this.qsCtl.deleteParam('sortDirection');
    }
    this.qsCtl.setLocation();
  }

  _onBulkDeleteClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-delete-form .items=${this.itemSelectCtl.selected}></caskfs-delete-form>`,
    });
  }

  _onUploadClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-upload-form></caskfs-upload-form>`,
    });
  }

}

customElements.define('caskfs-directory-controls', CaskfsDirectoryControls);