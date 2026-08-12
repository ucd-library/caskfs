import { LitElement } from 'lit';
import {render, styles} from "./caskfs-principal-relations.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";
import './caskfs-principal-typeahead.js';

const PAGE_SIZE = 25;

/**
 * @description Generic detail view for managing a role's members or a user's roles - the two
 * directions of the same role<->user relationship. Search/paginate the current relations,
 * remove one, or add an existing principal via a scoped typeahead.
 * @param {String} mode - 'role-members' (name is a role; manage its member users) |
 *   'user-roles' (name is a user; manage their roles)
 * @param {String} name - the role or user name this view is scoped to, per mode
 */
export default class CaskfsPrincipalRelations extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      mode: { type: String },
      name: { type: String },
      search: { state: true },
      page: { state: true },
      total: { state: true },
      items: { state: true },
      loading: { state: true },
      addValue: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.mode = 'role-members';
    this.name = '';
    this.search = '';
    this.page = 1;
    this.total = 0;
    this.items = [];
    this.loading = false;
    this.addValue = '';

    this._injectModel('AppStateModel', 'AclModel');
  }

  willUpdate(props) {
    if ( props.has('mode') || props.has('name') ) {
      this.search = '';
      this.page = 1;
      this.addValue = '';
      this._load();
    }
  }

  _toast(text, type='success') {
    this.AppStateModel.showToast({text, type});
  }

  /** @description type of the principals LISTED in this view */
  get relatedType() {
    return this.mode === 'role-members' ? 'user' : 'role';
  }

  /** @description type of `name`, the entity this view is scoped to */
  get scopeType() {
    return this.mode === 'role-members' ? 'role' : 'user';
  }

  get heading() {
    return this.mode === 'role-members' ? `Role: ${this.name}` : `User: ${this.name}`;
  }

  get maxPages() {
    return Math.max(1, Math.ceil(this.total / PAGE_SIZE));
  }

  async _load() {
    if ( !this.name ) return;
    this.loading = true;
    const opts = { search: this.search || undefined, limit: PAGE_SIZE, offset: (this.page - 1) * PAGE_SIZE };
    const res = this.mode === 'role-members'
      ? await this.AclModel.getRoleUsers(this.name, opts)
      : await this.AclModel.getUserRoles(this.name, opts);
    this.loading = false;
    if ( res.state !== 'loaded' ) return;
    this.total = res.payload.total;
    this.items = this.mode === 'role-members'
      ? res.payload.users.map(u => u.user)
      : res.payload.roles;
  }

  _onSearchInput(e) {
    this.search = e.target.value;
    if ( this.searchTimeout ) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.page = 1;
      this._load();
    }, 300);
  }

  _onPageChange(e) {
    this.page = e.detail.page;
    this._load();
  }

  _onAddInput(e) {
    this.addValue = e.detail.value;
  }

  _onAddSelect(e) {
    this.addValue = e.detail.name;
  }

  /** @description resolve {user, role} for addUserRole/removeUserRole given the current mode */
  _userAndRole(relatedName) {
    return this.mode === 'role-members'
      ? { user: relatedName, role: this.name }
      : { user: this.name, role: relatedName };
  }

  async _onAddClick() {
    const value = this.addValue.trim();
    if ( !value ) return;
    const { user, role } = this._userAndRole(value);
    const res = await this.AclModel.addUserRole(user, role);
    if ( res.state === 'loaded' ) {
      this._toast(this.mode === 'role-members' ? `Added ${value} to ${this.name}.` : `Assigned ${value} to ${this.name}.`);
      this.addValue = '';
      await this._load();
    } else {
      this._toast('Unable to add.', 'error');
    }
  }

  async _onRemoveClick(relatedName) {
    const { user, role } = this._userAndRole(relatedName);
    const res = await this.AclModel.removeUserRole(user, role);
    if ( res.state === 'loaded' ) {
      this._toast(this.mode === 'role-members' ? `Removed ${relatedName} from ${this.name}.` : `Removed ${relatedName} from ${this.name}.`);
      if ( this.items.length === 1 && this.page > 1 ) this.page -= 1;
      await this._load();
    } else {
      this._toast('Unable to remove.', 'error');
    }
  }

  _onBack() {
    this.dispatchEvent(new CustomEvent('caskfs-principal-relations-back', {
      bubbles: true,
      composed: true
    }));
  }

}

customElements.define('caskfs-principal-relations', CaskfsPrincipalRelations);
