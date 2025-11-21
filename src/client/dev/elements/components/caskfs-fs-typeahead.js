import { LitElement } from 'lit';
import {render, styles} from "./caskfs-fs-typeahead.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import DropdownController from '../../controllers/DropdownController.js';
import FsDisplayUtils from '../../utils/FsDisplayUtils.js';

/**
 * @description A typeahead input for searching the file system
 * @param {String} value - The current input value
 * @param {Array} suggestions - The current list of suggestions
 * @param {Number} suggestionLimit - The max number of suggestions to show
 * @param {Boolean} showSuggestions - Whether to show the suggestion dropdown
 * @param {Number} totalSuggestions - The total number of suggestions available
 * @param {Object} suggestionContainerStyles - Styles to apply to the suggestion container for positioning
 */
export default class CaskfsFsTypeahead extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      value: { type: String },
      _value: { state: true },
      suggestions: { type: Array },
      suggestionLimit: { type: Number, attribute: 'suggestion-limit' },
      totalSuggestions: { state: true },
      fetchError: { state: true },
      suggestionContainerStyles: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.value = '';
    this.suggestions = [];
    this.suggestionLimit = 10;
    this.fetchError = false;
    this.totalSuggestions = 0;
    this.suggestionContainerStyles = {};

    this.ctl = {
      qs: new QueryStringController(this, { types: { partition: 'array'}}),
      dropdown: new DropdownController(this, {defaultMaxHeight: 190, belowCustomStyles: { borderTop: 'none' } })
    };

    this._injectModel('DirectoryModel', 'AppStateModel');
  }

  willUpdate(props){

    // extract directory and directory item search from value
    if ( props.has('value') ) {
      const path = this.value.trim().split('/').filter(d => d);
      let dir, search;
      if ( path.length ) {
        if ( this.value.endsWith('/') ) {
          dir = '/' + path.join('/');
          search = '';
        } else {
          search = path.pop();
          dir = '/' + path.join('/');
        }
      } else {
        dir = '/';
        search = '';
      }
      this._value = { dir, search };
    }
  }

  _onAppStateUpdate() {
    this.value = '';
    this.suggestions = [];
    this.ctl.dropdown.open = false;
  }

  async _onValueInput(e){
    this.value = e.target.value;
    if ( this.searchTimeout ) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(async () => {
      this.ctl.dropdown.open = false;
      await this.getSuggestions();
      this.ctl.dropdown.open = true;
    }, 300);

  }

  async _onValueFocus(){
    this.ctl.dropdown.open = false;
    await this.getSuggestions();
    this.ctl.dropdown.open = true;
  }

  async getSuggestions(){
    this.fetchError = false;
    const query = {
      limit: this.suggestionLimit
    }
    if ( this._value.search ) {
      query.query = this._value.search;
    }
    const req = await this.DirectoryModel.list(this._value.dir, query, { loaderSettings: {suppressLoader: true}, errorSettings: {suppressError: true} });
    if ( req.state === 'error' ){
      this.suggestions = [];
      this.fetchError = req.error.response.status !== 404;
      return;
    }
    this.suggestions = [...req.payload.directories, ...req.payload.files].map(x => new FsDisplayUtils(x));
    this.totalSuggestions = req.payload.totalCount;
  }

  async _onSuggestionClick(suggestion){
    this.value = suggestion.isDirectory ? suggestion.metadata.fullname + '/' : suggestion.metadata.filepath;
    await this.updateComplete;

    this.dispatchEvent(new CustomEvent('caskfs-fs-typeahead-select', {
      detail: {
        suggestion
      },
      bubbles: true,
      composed: true
    }));

    if ( suggestion.isDirectory ) {
      this.renderRoot.getElementById('value-input').focus();
      this.getSuggestions();
      return;
    }
    this.ctl.dropdown.open = false;
  }

}

customElements.define('caskfs-fs-typeahead', CaskfsFsTypeahead);