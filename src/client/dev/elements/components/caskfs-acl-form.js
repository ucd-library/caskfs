import { LitElement } from 'lit';
import {render, styles} from "./caskfs-acl-form.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";
import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import './caskfs-principal-typeahead.js';

const PERMISSIONS = ['read', 'write', 'admin'];

/**
 * @description Modal content for viewing/editing a directory's ACL. Opened via
 * AppStateModel.showDialogModal({content: () => html`<caskfs-acl-form .directory=${path}>`}).
 * This is a self-contained management panel (add/remove/toggle several independent things),
 * not a single-submit form, so it does not use ModalFormController - every action here calls
 * AclModel directly and re-renders in place, and the modal's own footer stays a plain "Close".
 * @param {String} directory - the directory path to manage
 */
export default class CaskfsAclForm extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      directory: { type: String },
      acl: { state: true },
      loading: { state: true },
      errorMessage: { state: true },
      addPrincipalType: { state: true },
      addPrincipalName: { state: true },
      addPermission: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.directory = '/';
    this.acl = null;
    this.loading = false;
    this.errorMessage = '';
    this.addPrincipalType = 'role';
    this.addPrincipalName = '';
    this.addPermission = 'read';
    this.permissions = PERMISSIONS;

    this.ctl = {
      directoryPath: new DirectoryPathController(this)
    };

    this._injectModel('AppStateModel', 'AclModel');
  }

  willUpdate(props) {
    if ( props.has('directory') && this.directory && !this._loaded ) {
      this._loaded = true;
      this._load();
    }
  }

  /**
   * @description True when this directory has no ACL of its own and is inheriting from an
   * ancestor (or from nothing at all, if root_acl_directory is null).
   */
  get isInherited() {
    if ( !this.acl ) return false;
    return this.acl.root_acl_directory !== this.directory;
  }

  get hasNoAclAnywhere() {
    return this.isInherited && !this.acl?.root_acl_directory;
  }

  async _load() {
    this.loading = true;
    this.errorMessage = '';
    const req = await this.AclModel.getDirectoryAcl(this.directory, { errorSettings: { suppressError: true } });
    this.loading = false;
    if ( req.state === 'error' ) {
      const status = req.error?.response?.status;
      if ( status === 404 ) {
        this.errorMessage = 'This directory does not exist.';
      } else if ( status === 403 ) {
        this.errorMessage = 'You do not have access to manage this directory\'s ACL.';
      } else {
        this.errorMessage = 'Unable to load this directory\'s ACL.';
      }
      this.acl = null;
      return;
    }
    this.acl = req.payload;
  }

  _toast(text, type='success') {
    this.AppStateModel.showToast({text, type});
  }

  async _onCreateAclHere() {
    const perms = this.acl?.permissions || [];
    // setDirectoryPublic() always creates and links this directory's own root ACL (regardless
    // of the public value passed), which is what actually materializes the local override.
    // Without this call, a directory with zero inherited permissions to copy would never make
    // any API call here at all, despite the success toast below.
    await this.AclModel.setDirectoryPublic(this.directory, !!this.acl?.public);
    for ( const p of perms ) {
      await this.AclModel.setDirectoryPermission(this.directory, p.principalName, p.principalType, p.permission);
    }
    this._toast(perms.length ? 'Created a local ACL, copying the inherited permissions.' : 'Created an empty local ACL for this directory.');
    await this._load();
  }

  _onGoToRoot() {
    if ( !this.acl?.root_acl_directory ) return;
    this.AppStateModel.closeDialogModal();
    this.ctl.directoryPath.setLocation(this.acl.root_acl_directory);
  }

  async _onTogglePublic(e) {
    const isPublic = e.target.checked;
    const res = await this.AclModel.setDirectoryPublic(this.directory, isPublic);
    if ( res.state === 'loaded' ) {
      this._toast(isPublic ? 'Directory is now public.' : 'Directory is no longer public.');
      await this._load();
    } else {
      this._toast('Unable to update the public flag.', 'error');
      e.target.checked = !isPublic;
    }
  }

  async _onRemovePermission(p) {
    const res = await this.AclModel.removeDirectoryPermission(this.directory, p.principalName, p.principalType, p.permission);
    if ( res.state === 'loaded' ) {
      this._toast(`Removed ${p.permission} access from ${p.principalName}.`);
      await this._load();
    } else {
      this._toast('Unable to revoke access.', 'error');
    }
  }

  _onAddTypeaheadSelect(e) {
    this.addPrincipalName = e.detail.name;
  }

  _onAddPrincipalNameInput(e) {
    this.addPrincipalName = e.detail.value;
  }

  _onAddPrincipalTypeChange(e) {
    this.addPrincipalType = e.target.value;
    this.addPrincipalName = '';
  }

  _onAddPermissionChange(e) {
    this.addPermission = e.target.value;
  }

  async _onAddPermissionClick() {
    if ( !this.addPrincipalName?.trim() ) {
      this._toast('Enter a role or user name.', 'error');
      return;
    }
    const res = await this.AclModel.setDirectoryPermission(this.directory, this.addPrincipalName.trim(), this.addPrincipalType, this.addPermission);
    if ( res.state === 'loaded' ) {
      this._toast(`Granted ${this.addPermission} access to ${this.addPrincipalName.trim()}.`);
      this.addPrincipalName = '';
      await this._load();
    } else {
      this._toast('Unable to grant access.', 'error');
    }
  }

  async _onRemoveAcl() {
    const res = await this.AclModel.removeDirectoryAcl(this.directory);
    if ( res.state === 'loaded' ) {
      this._toast('Removed this directory\'s ACL. It now inherits from its parent.');
      await this._load();
    } else {
      this._toast('Unable to remove the directory ACL.', 'error');
    }
  }

}

customElements.define('caskfs-acl-form', CaskfsAclForm);
