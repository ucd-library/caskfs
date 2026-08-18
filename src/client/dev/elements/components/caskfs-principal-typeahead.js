import { LitElement } from 'lit';
import {render, styles} from "./caskfs-principal-typeahead.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import DropdownController from '../../controllers/DropdownController.js';

/**
 * @description A typeahead input scoped to a single principal namespace (roles or users).
 * Fetches the full role/user list once (cached by AclModel/AclStore) and filters client-side -
 * this is an internal admin tool, not a large-scale directory, so no server-side search is needed.
 * @param {String} type - 'role' | 'user'. Which namespace to search.
 * @param {String} value - The current input value
 * @param {String} placeholder - Placeholder text for the input
 */
export default class CaskfsPrincipalTypeahead extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      type: { type: String },
      value: { type: String },
      placeholder: { type: String },
      suggestions: { state: true },
      fetchError: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.type = 'role';
    this.value = '';
    this.placeholder = 'Search...';
    this.suggestions = [];
    this.fetchError = false;
    this._all = [];

    this.ctl = {
      dropdown: new DropdownController(this, {defaultMaxHeight: 190, belowCustomStyles: { borderTop: 'none' } })
    };

    this._injectModel('AclModel');
  }

  willUpdate(props) {
    if ( props.has('type') ) {
      this._all = [];
    }
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown.bind(this));
  }

  _onKeyDown(e) {
    this.focusOnArrowKey(e);
    this.blurOnEscape(e);
  }

  blurOnEscape(e) {
    if ( e.key === 'Escape' && this.ctl.dropdown.open ) {
      this.ctl.dropdown.open = false;
      this.renderRoot.getElementById('value-input')?.blur();
    }
  }

  focusOnArrowKey(e) {
    if ( !this.ctl.dropdown.open ) return;
    if ( e.key !== 'ArrowDown' && e.key !== 'ArrowUp' ) return;
    const suggestionButtons = this.renderRoot.querySelectorAll('.suggestion-item');
    if ( suggestionButtons.length === 0 ) return;
    let focusedIndex = -1;
    suggestionButtons.forEach((btn, i) => {
      if ( this.renderRoot.activeElement === btn ) focusedIndex = i;
    });
    e.preventDefault();
    if ( e.key === 'ArrowDown' ) {
      focusedIndex = (focusedIndex + 1) % suggestionButtons.length;
    } else {
      focusedIndex = (focusedIndex - 1 + suggestionButtons.length) % suggestionButtons.length;
    }
    suggestionButtons[focusedIndex].focus();
  }

  /**
   * @description Fetch the full role/user list once per type, caching the result on this
   * instance. AclModel/AclStore already dedupe the underlying network request across every
   * typeahead instance of the same type.
   */
  async _ensureLoaded() {
    if ( this._all.length ) return;
    const req = this.type === 'user'
      ? await this.AclModel.getUsers({ limit: 1000 })
      : await this.AclModel.getRoles({ limit: 1000 });
    if ( req.state === 'error' ) {
      this.fetchError = true;
      return;
    }
    this.fetchError = false;
    const items = (this.type === 'user' ? req.payload?.users : req.payload?.roles) || [];
    this._all = items.map(x => this.type === 'user' ? x.user : x.role);
  }

  async _filter() {
    await this._ensureLoaded();
    const q = this.value.trim().toLowerCase();
    this.suggestions = !q ? this._all.slice(0, 10) : this._all.filter(n => n.toLowerCase().includes(q)).slice(0, 10);
  }

  async _onValueInput(e) {
    this.value = e.target.value;

    // Native input events on a shadow-DOM-internal <input> aren't reliable to listen for
    // from outside this element, so report every keystroke explicitly - the parent form
    // needs the typed value even when it doesn't match a suggestion (e.g. a brand-new
    // role/user name that will be created on submit).
    this.dispatchEvent(new CustomEvent('caskfs-principal-typeahead-input', {
      detail: { type: this.type, value: this.value },
      bubbles: true,
      composed: true
    }));

    if ( this.searchTimeout ) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(async () => {
      this.ctl.dropdown.open = false;
      await this._filter();
      this.ctl.dropdown.open = true;
    }, 200);
  }

  async _onValueFocus() {
    this.ctl.dropdown.open = false;
    await this._filter();
    this.ctl.dropdown.open = true;
  }

  _onSuggestionClick(name) {
    this.value = name;
    this.ctl.dropdown.open = false;

    this.dispatchEvent(new CustomEvent('caskfs-principal-typeahead-select', {
      detail: { type: this.type, name },
      bubbles: true,
      composed: true
    }));
  }

}

customElements.define('caskfs-principal-typeahead', CaskfsPrincipalTypeahead);
