import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-page-file-single.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";
import config from '../../config.js';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import AppComponentController from '../../controllers/AppComponentController.js';
import ScrollController from '../../controllers/ScrollController.js';
import DirectoryPermissionController from '../../controllers/DirectoryPermissionController.js';

import '../components/caskfs-delete-form.js';
import '../components/caskfs-acl-form.js';

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
      directoryPath: new DirectoryPathController(this),
      scroll: new ScrollController(this),
      permission: new DirectoryPermissionController(this)
    };

    this._injectModel('AppStateModel', 'FsModel');
  }

  /**
   * @description Manage Access here manages the file's owning directory's ACL, so it's gated
   * on admin permission on that parent directory - hidden outright when ACL is disabled.
   */
  get showManageAccess() {
    return !!config.aclEnabled && this.ctl.permission.canAdmin;
  }

  /**
   * @description Viewing a file's audit history requires write permission (getAuditLog is
   * gated the same way server-side) - always shown when ACL is disabled, since permissions
   * aren't enforced server-side either way.
   */
  get showAuditLog() {
    return !config.aclEnabled || this.ctl.permission.canWrite;
  }

  updated(changedProps) {
    super.updated(changedProps);
    this.ctl.permission.check(this.ctl.directoryPath.parentPath || '/');
  }

  async _onAppStateUpdate() {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.getMetadata();
    this.ctl.scroll.scrollToTop();
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

  _onCopyPathClick() {
    navigator.clipboard.writeText(this.ctl.directoryPath.pathname);
    this.AppStateModel.showToast({text: 'File system path copied to clipboard', type: 'success'});
  }

  _onManageAccessClick() {
    // ACL is directory-scoped, so this manages the ACL of the file's owning directory.
    const directory = this.ctl.directoryPath.parentPath || '/';
    this.AppStateModel.showDialogModal({
      title: `Manage Access: ${directory}`,
      content: () => html`<caskfs-acl-form .directory=${directory}></caskfs-acl-form>`,
      fullWidth: true,
      actions: [{text: 'Close', value: 'dismiss', invert: true, color: 'secondary'}]
    });
  }

  _onViewAuditHistoryClick() {
    const filePath = this.ctl.directoryPath.pathname;
    this.AppStateModel.showDialogModal({
      title: `Audit History: ${filePath}`,
      content: () => html`<caskfs-audit-log .resourcePath=${filePath} .isFile=${true}></caskfs-audit-log>`,
      fullWidth: true,
      actions: [{text: 'Close', value: 'dismiss', invert: true, color: 'secondary'}]
    });
  }

}

customElements.define('caskfs-page-file-single', CaskfsPageFileSingle);