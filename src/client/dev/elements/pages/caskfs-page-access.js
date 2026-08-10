import { LitElement } from 'lit';
import {render, styles} from "./caskfs-page-access.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';
import '../components/caskfs-principal-typeahead.js';

/**
 * @description Global roles/users management page. Covers both, since managing role
 * membership inherently needs both sides, and gated (via the "Access" nav link, see
 * caskfs-app.tpl.js) to global admins only - a directory-scoped-only admin has no
 * legitimate use for creating/deleting global roles or users.
 */
export default class CaskfsPageAccess extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      roles: { state: true },
      users: { state: true },
      newRoleName: { state: true },
      newUserName: { state: true },
      expandedRole: { state: true },
      expandedUser: { state: true },
      roleMembers: { state: true },
      userRoles: { state: true },
      addMemberName: { state: true },
      addRoleForUserName: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.roles = [];
    this.users = [];
    this.newRoleName = '';
    this.newUserName = '';
    this.expandedRole = null;
    this.expandedUser = null;
    this.roleMembers = [];
    this.userRoles = [];
    this.addMemberName = '';
    this.addRoleForUserName = '';

    this.ctl = {
      appComponent: new AppComponentController(this)
    };

    this._injectModel('AppStateModel', 'AclModel');
  }

  async _onAppStateUpdate() {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.getRoles();
    this.getUsers();
  }

  _toast(text, type='success') {
    this.AppStateModel.showToast({text, type});
  }

  async getRoles() {
    const res = await this.AclModel.getRoles();
    this.roles = res.state === 'loaded' ? res.payload : [];
  }

  async getUsers() {
    const res = await this.AclModel.getUsers();
    this.users = res.state === 'loaded' ? res.payload : [];
  }

  _onNewRoleNameInput(e) {
    this.newRoleName = e.target.value;
  }

  _onNewUserNameInput(e) {
    this.newUserName = e.target.value;
  }

  async _onCreateRole() {
    const name = this.newRoleName.trim();
    if ( !name ) return;
    const res = await this.AclModel.createRole(name);
    if ( res.state === 'loaded' ) {
      this._toast(`Created role "${name}".`);
      this.newRoleName = '';
      await this.getRoles();
    } else {
      this._toast('Unable to create role.', 'error');
    }
  }

  async _onDeleteRole(role) {
    const res = await this.AclModel.deleteRole(role);
    if ( res.state === 'loaded' ) {
      this._toast(`Deleted role "${role}".`);
      if ( this.expandedRole === role ) this.expandedRole = null;
      await this.getRoles();
    } else {
      this._toast('Unable to delete role.', 'error');
    }
  }

  async _onToggleRoleExpand(role) {
    if ( this.expandedRole === role ) {
      this.expandedRole = null;
      return;
    }
    this.expandedRole = role;
    this.addMemberName = '';
    await this._loadRoleMembers(role);
  }

  async _loadRoleMembers(role) {
    const res = await this.AclModel.getRoleUsers(role);
    this.roleMembers = res.state === 'loaded' ? res.payload : [];
  }

  _onAddMemberInput(e) {
    this.addMemberName = e.detail.value;
  }

  _onAddMemberSelect(e) {
    this.addMemberName = e.detail.name;
  }

  async _onAddMemberClick() {
    const name = this.addMemberName?.trim();
    if ( !name || !this.expandedRole ) return;
    const res = await this.AclModel.addUserRole(name, this.expandedRole);
    if ( res.state === 'loaded' ) {
      this._toast(`Added ${name} to ${this.expandedRole}.`);
      this.addMemberName = '';
      await this._loadRoleMembers(this.expandedRole);
    } else {
      this._toast('Unable to add member.', 'error');
    }
  }

  async _onRemoveMember(user) {
    const res = await this.AclModel.removeUserRole(user, this.expandedRole);
    if ( res.state === 'loaded' ) {
      this._toast(`Removed ${user} from ${this.expandedRole}.`);
      await this._loadRoleMembers(this.expandedRole);
    } else {
      this._toast('Unable to remove member.', 'error');
    }
  }

  async _onCreateUser() {
    const name = this.newUserName.trim();
    if ( !name ) return;
    const res = await this.AclModel.createUser(name);
    if ( res.state === 'loaded' ) {
      this._toast(`Created user "${name}".`);
      this.newUserName = '';
      await this.getUsers();
    } else {
      this._toast('Unable to create user.', 'error');
    }
  }

  async _onDeleteUser(user) {
    const res = await this.AclModel.deleteUser(user);
    if ( res.state === 'loaded' ) {
      this._toast(`Deleted user "${user}".`);
      if ( this.expandedUser === user ) this.expandedUser = null;
      await this.getUsers();
    } else {
      this._toast('Unable to delete user.', 'error');
    }
  }

  async _onToggleUserExpand(user) {
    if ( this.expandedUser === user ) {
      this.expandedUser = null;
      return;
    }
    this.expandedUser = user;
    this.addRoleForUserName = '';
    await this._loadUserRoles(user);
  }

  async _loadUserRoles(user) {
    const res = await this.AclModel.getUserRoles(user);
    this.userRoles = res.state === 'loaded' ? res.payload : [];
  }

  _onAddRoleForUserInput(e) {
    this.addRoleForUserName = e.detail.value;
  }

  _onAddRoleForUserSelect(e) {
    this.addRoleForUserName = e.detail.name;
  }

  async _onAddRoleForUserClick() {
    const role = this.addRoleForUserName?.trim();
    if ( !role || !this.expandedUser ) return;
    const res = await this.AclModel.addUserRole(this.expandedUser, role);
    if ( res.state === 'loaded' ) {
      this._toast(`Assigned ${role} to ${this.expandedUser}.`);
      this.addRoleForUserName = '';
      await this._loadUserRoles(this.expandedUser);
    } else {
      this._toast('Unable to assign role.', 'error');
    }
  }

  async _onRemoveRoleFromUser(role) {
    const res = await this.AclModel.removeUserRole(this.expandedUser, role);
    if ( res.state === 'loaded' ) {
      this._toast(`Removed ${role} from ${this.expandedUser}.`);
      await this._loadUserRoles(this.expandedUser);
    } else {
      this._toast('Unable to remove role.', 'error');
    }
  }

}

customElements.define('caskfs-page-access', CaskfsPageAccess);
