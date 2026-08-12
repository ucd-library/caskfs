import { LitElement } from 'lit';
import {render, styles} from "./caskfs-principal-list.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

const PAGE_SIZE = 25;

/**
 * @description Generic searchable/paginated top-level list of roles or users, for the Access
 * page's left-nav tabs. One combined text input drives both search-as-you-type and "add new"
 * (an Add button next to it creates a role/user with the current input text). Clicking a row
 * fires `caskfs-principal-list-select` so the parent page can switch to a detail view.
 * @param {String} type - 'role' | 'user'. Which namespace this list manages.
 */
export default class CaskfsPrincipalList extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      type: { type: String },
      search: { state: true },
      page: { state: true },
      total: { state: true },
      items: { state: true },
      loading: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.type = 'role';
    this.search = '';
    this.page = 1;
    this.total = 0;
    this.items = [];
    this.loading = false;

    this._injectModel('AppStateModel', 'AclModel');
  }

  willUpdate(props) {
    if ( props.has('type') ) {
      this.search = '';
      this.page = 1;
      this._load();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  _toast(text, type='success') {
    this.AppStateModel.showToast({text, type});
  }

  get _label() {
    return this.type === 'user' ? 'user' : 'role';
  }

  async _load() {
    this.loading = true;
    const opts = { search: this.search || undefined, limit: PAGE_SIZE, offset: (this.page - 1) * PAGE_SIZE };
    const res = this.type === 'user'
      ? await this.AclModel.getUsers(opts)
      : await this.AclModel.getRoles(opts);
    this.loading = false;
    if ( res.state !== 'loaded' ) return;
    this.total = res.payload.total;
    this.items = (this.type === 'user' ? res.payload.users : res.payload.roles).map(x => this.type === 'user' ? x.user : x.role);
  }

  get maxPages() {
    return Math.max(1, Math.ceil(this.total / PAGE_SIZE));
  }

  _onSearchInput(e) {
    this.search = e.target.value;
    if ( this.searchTimeout ) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.page = 1;
      this._load();
    }, 300);
  }

  async _onAddClick() {
    const name = this.search.trim();
    if ( !name ) return;
    const res = this.type === 'user'
      ? await this.AclModel.createUser(name)
      : await this.AclModel.createRole(name);
    if ( res.state === 'loaded' ) {
      this._toast(`Created ${this._label} "${name}".`);
      this.search = '';
      this.page = 1;
      await this._load();
    } else {
      this._toast(`Unable to create ${this._label}.`, 'error');
    }
  }

  async _onDeleteClick(name) {
    const res = this.type === 'user'
      ? await this.AclModel.deleteUser(name)
      : await this.AclModel.deleteRole(name);
    if ( res.state === 'loaded' ) {
      this._toast(`Deleted ${this._label} "${name}".`);
      if ( this.items.length === 1 && this.page > 1 ) this.page -= 1;
      await this._load();
    } else {
      this._toast(`Unable to delete ${this._label}.`, 'error');
    }
  }

  _onRowClick(name) {
    this.dispatchEvent(new CustomEvent('caskfs-principal-list-select', {
      detail: { name },
      bubbles: true,
      composed: true
    }));
  }

  _onPageChange(e) {
    this.page = e.detail.page;
    this._load();
  }

}

customElements.define('caskfs-principal-list', CaskfsPrincipalList);
