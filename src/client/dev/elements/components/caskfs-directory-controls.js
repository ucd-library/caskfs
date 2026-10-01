import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-directory-controls.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import config from '../../config.js';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import DirectoryPermissionController from '../../controllers/DirectoryPermissionController.js';

import './caskfs-delete-form.js';
import './caskfs-upload-button.js';
import './caskf-sort-form.js';
import './caskfs-upload-tracker-toggle.js';
import './caskfs-acl-form.js';
import './caskfs-create-directory-form.js';
import './caskfs-audit-log.js';

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
      select: new DirectoryItemSelectController(this),
      permission: new DirectoryPermissionController(this)
    };

    this._injectModel('AppStateModel');
  }

  /**
   * @description Write-permission-gated controls (Create Folder, Upload, Delete Selected).
   * Always shown when ACL is disabled - permissions aren't enforced server-side either way.
   * When ACL is enabled, shown only once the current user's write-permission self-check on
   * this directory has resolved true.
   */
  get showWriteControls() {
    return !config.aclEnabled || this.ctl.permission.canWrite;
  }

  /**
   * @description Manage Access is itself an ACL control, so unlike showWriteControls it's
   * hidden outright whenever ACL is disabled, and otherwise requires the current user to hold
   * admin permission on this directory (the same permission the ACL form itself requires).
   */
  get showManageAccess() {
    return !!config.aclEnabled && this.ctl.permission.canAdmin;
  }

  /**
   * @description Viewing a directory's audit history requires audit logging to be enabled
   * server-side (otherwise there's nothing to show) and write permission (getAuditLog is
   * gated the same way server-side) - permission is always satisfied when ACL is disabled,
   * since permissions aren't enforced server-side either way.
   */
  get showAuditLog() {
    return !!config.auditEnabled && (!config.aclEnabled || this.ctl.permission.canWrite);
  }

  /**
   * @description Re-run the write/admin self-check whenever the viewed directory changes.
   * directoryPath.pathname isn't a reactive Lit property (it's a getter on a controller kept
   * in sync by app-state-update events), so this diffs it on every render pass instead of
   * relying on willUpdate(changedProps).
   */
  updated(changedProps) {
    super.updated(changedProps);
    this.ctl.permission.check(this.ctl.directoryPath.pathname);
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

  _onViewAuditHistoryClick() {
    const directory = this.ctl.directoryPath.pathname;
    this.AppStateModel.showDialogModal({
      title: `Audit History: ${directory}`,
      content: () => html`<caskfs-audit-log .resourcePath=${directory} .isFile=${false}></caskfs-audit-log>`,
      fullWidth: true,
      actions: [{text: 'Close', value: 'dismiss', invert: true, color: 'secondary'}]
    });
  }

}

customElements.define('caskfs-directory-controls', CaskfsDirectoryControls);