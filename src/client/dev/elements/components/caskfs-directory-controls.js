import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-directory-controls.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';

import './caskfs-delete-form.js';
import './caskfs-upload-button.js';
import './caskf-sort-form.js';
import './caskfs-upload-tracker-toggle.js';
import './caskfs-acl-form.js';
import './caskfs-create-directory-form.js';

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
      { label: 'Last Modified', value: 'lastModified', type: 'date' },
      { label: 'Size', value: 'size', type: 'number' },
      { label: 'Kind', value: 'kind' },
      { label: 'Modified By', value: 'modifiedBy', type: 'string' }
    ];
    this.sortValue = '';
    this.sortIsDesc = false;

    this.ctl = {
      directoryPath: new DirectoryPathController(this),
      select: new DirectoryItemSelectController(this)
    };

    this._injectModel('AppStateModel');
  }

  _onBulkDeleteClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-delete-form .items=${this.ctl.select.selected}></caskfs-delete-form>`,
    });
  }

  _onSortClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`
        <caskf-sort-form
          .options=${this.sortOptions}
          .modalTitle=${"Sort Directory Items"}
        ></caskf-sort-form>
      `,
    });
  }

  _onCopyPathClick() {
    navigator.clipboard.writeText(this.ctl.directoryPath.pathname);
    this.AppStateModel.showToast({text: 'Directory path copied to clipboard', type: 'success'});
  }

  _onCreateFolderClick() {
    const directory = this.ctl.directoryPath.pathname;
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-create-directory-form parent-directory=${directory}></caskfs-create-directory-form>`,
    });
  }

  _onManageAccessClick() {
    const directory = this.ctl.directoryPath.pathname;
    this.AppStateModel.showDialogModal({
      title: `Manage Access: ${directory}`,
      content: () => html`<caskfs-acl-form .directory=${directory}></caskfs-acl-form>`,
      fullWidth: true,
      actions: [{text: 'Close', value: 'dismiss', invert: true, color: 'secondary'}]
    });
  }

}

customElements.define('caskfs-directory-controls', CaskfsDirectoryControls);