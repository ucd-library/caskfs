import { LitElement } from 'lit';
import {render, styles} from "./caskfs-value-typeahead.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import DropdownController from '../../controllers/DropdownController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

/**
 * @description A typeahead input for filter values backed by a server-side suggestion source
 * @param {String} value - The current input value
 * @param {String} source - Which suggestion source to query: 'uri' or 'partition-key'
 * @param {Number} suggestionLimit - The max number of suggestions to show
 * @param {String} placeholder - Placeholder text for the input
 * @param {Boolean} isMultiple - Whether this input is part of a multi-value filter row (styling only)
 */
export default class CaskfsValueTypeahead extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      value: { type: String },
      source: { type: String },
      suggestionLimit: { type: Number, attribute: 'suggestion-limit' },
      placeholder: { type: String },
      isMultiple: { type: Boolean, attribute: 'is-multiple', reflect: true },
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
    this.value = '';
    this.source = 'uri';
    this.suggestionLimit = 8;
    this.placeholder = 'Enter filter value';
    this.isMultiple = false;
    this.suggestions = [];
    this.fetchError = false;

    this.ctl = {
      appComponent: new AppComponentController(this),
      dropdown: new DropdownController(this, {defaultMaxHeight: 190, belowCustomStyles: { borderTop: 'none' } })
    };

    this._injectModel('LdModel');
  }

  /**
   * @description Emit a value-changed event so the parent filter form updates its state
   * @param {String} value
   */
  _emitInput(value) {
    this.dispatchEvent(new CustomEvent('caskfs-value-typeahead-input', {
      detail: { value },
      bubbles: true,
      composed: true
    }));
  }

  _onValueInput(e) {
    const value = e.target.value;
    this._emitInput(value);
    if ( this.searchTimeout ) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(async () => {
      this.ctl.dropdown.open = false;
      await this.getSuggestions(value);
      this.ctl.dropdown.open = true;
    }, 300);
  }

  async _onValueFocus() {
    this.ctl.dropdown.open = false;
    await this.getSuggestions(this.value);
    this.ctl.dropdown.open = true;
  }

  /**
   * @description Fetch suggestions from the server for the current source
   * @param {String} term
   */
  async getSuggestions(term) {
    this.fetchError = false;
    if ( !term ) {
      this.suggestions = [];
      return;
    }
    const req = this.source === 'partition-key' ?
      await this.LdModel.suggestPartitionKey(term, this.suggestionLimit) :
      await this.LdModel.suggestUri(term, this.suggestionLimit);

    if ( req.state === 'error' ) {
      this.suggestions = [];
      this.fetchError = true;
      return;
    }
    this.suggestions = req.payload || [];
  }

  _onSuggestionClick(suggestion) {
    this.value = suggestion;
    this._emitInput(suggestion);
    this.ctl.dropdown.open = false;
  }

}

customElements.define('caskfs-value-typeahead', CaskfsValueTypeahead);
