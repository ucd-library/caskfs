import { LitElement } from 'lit';
import {render, styles} from "./caskfs-page-access.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";
import config from '../../config.js';

import '../components/caskfs-principal-list.js';
import '../components/caskfs-principal-relations.js';

/**
 * @description Global roles/users management page. Left nav switches between a Roles tab and
 * a Users tab (caskfs-principal-list), each showing one searchable/paginated list at a time.
 * Clicking a row drills into a detail view (caskfs-principal-relations) for managing that
 * role's members or that user's roles. Gated to global admins via the "Access" nav link in
 * caskfs-app.tpl.js - a directory-scoped-only admin has no legitimate use for creating/deleting
 * global roles or users. Also independently checks isAuthorized itself (rather than trusting
 * the nav link alone), since a direct URL visit bypasses that link entirely.
 */
export default class CaskfsPageAccess extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      activeTab: { state: true },
      selected: { state: true },
      currentUser: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.activeTab = 'roles';
    this.selected = null;
    this.currentUser = { username: null, roles: [], isAdmin: false };

    this._injectModel('AclModel');
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadWhoAmI();
  }

  async _loadWhoAmI() {
    const res = await this.AclModel.getWhoAmI();
    if ( res.state === 'loaded' ) {
      this.currentUser = res.payload;
    }
  }

  /**
   * @description Whether this page's content should render. False whenever ACL is disabled
   * (there's no meaningful roles/users admin to do), or when the current user isn't a global
   * admin.
   */
  get isAuthorized() {
    return !!config.aclEnabled && !!this.currentUser?.isAdmin;
  }

  _onTabClick(tab) {
    this.activeTab = tab;
    this.selected = null;
  }

  _onListSelect(e) {
    this.selected = e.detail.name;
  }

  _onRelationsBack() {
    this.selected = null;
  }

}

customElements.define('caskfs-page-access', CaskfsPageAccess);
