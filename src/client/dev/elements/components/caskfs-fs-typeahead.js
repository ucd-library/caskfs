import { LitElement } from 'lit';
import {render, styles} from "./caskfs-fs-typeahead.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
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
      showSuggestions: { state: true },
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
    this.suggestionLimit = 20;
    this.showSuggestions = false;
    this.fetchError = false;
    this.totalSuggestions = 0;
    this.suggestionContainerStyles = {};

    this.ctl = {
      qs: new QueryStringController(this, { types: { partition: 'array'}})
    };

    this._injectModel('DirectoryModel', 'AppStateModel');
  }

  connectedCallback() {
    super.connectedCallback();
    this._onWindowResize = this._onWindowResize.bind(this);
    window.addEventListener('resize', this._onWindowResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this._onWindowResize);
  }

  _onWindowResize(){
    this.showSuggestions = false;
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

    if ( props.has( 'showSuggestions') && this.showSuggestions ) {
      this.setSuggestionsContainerStyles();
    }
  }

  _onAppStateUpdate() {
    this.value = '';
    this.suggestions = [];
    this.showSuggestions = false;
  }

  /**
   * @description Set size/position styles for suggestion container based on available viewport space
   */
  setSuggestionsContainerStyles(){
    const eleRect = this.getBoundingClientRect();
    const defaultMaxHeight = 190;
    const styles = {
      maxWidth: `${eleRect.width}px`
    };

    const availableHeightBelow = Math.round(window.innerHeight - eleRect.bottom - 20);
    if ( availableHeightBelow > 100 ) {
      styles.maxHeight = availableHeightBelow < defaultMaxHeight ? `${availableHeightBelow}px` : `${defaultMaxHeight}px`;
      styles.borderTop = 'none';
    } else {
      const availableHeightAbove = eleRect.top - 20;
      styles.bottom = `${eleRect.height}px`;
      styles.maxHeight = availableHeightAbove < defaultMaxHeight ? `${availableHeightAbove}px` : `${defaultMaxHeight}px`;
    }

    this.suggestionContainerStyles = styles;
  }

  async _onValueInput(e){
    this.value = e.target.value;
    if ( this.searchTimeout ) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(async () => {
      this.showSuggestions = false;
      await this.getSuggestions();
      this.showSuggestions = true;
    }, 300);

  }

  async _onValueFocus(){
    this.showSuggestions = false;
    await this.getSuggestions();
    this.showSuggestions = true;
  }

  async getSuggestions(){
    this.fetchError = false;
    const req = await this.DirectoryModel.list(this._value.dir, { loaderSettings: {suppressLoader: true}, errorSettings: {suppressError: true} });
    if ( req.state === 'error' ){
      this.suggestions = [];
      this.fetchError = req.error.response.status !== 404;
      return;
    }
    const suggestions = [...req.payload.directories, ...req.payload.files].map(x => new FsDisplayUtils(x)).filter(item => {
      const hasSearch = item.name.toLowerCase().includes(this._value.search.toLowerCase());

      let hasPartition = true;
      if ( this.ctl.qs.query.partition?.length && Object.keys(item.metadata).includes('partition_keys') ) {
        const itemPartitions = item.metadata.partition_keys || [];
        hasPartition = this.ctl.qs.query.partition.every(p => itemPartitions.includes(p));
      }

      return hasSearch && hasPartition;
    });
    this.totalSuggestions = suggestions.length;
    this.suggestions = suggestions.slice(0, this.suggestionLimit);
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
    this.showSuggestions = false;
  }

  _onElementFocusOut(){
    setTimeout(() => {
      if ( !this.renderRoot.activeElement ) {
        this.showSuggestions = false;
      }
    }, 100);
  }

}


customElements.define('caskfs-fs-typeahead', CaskfsFsTypeahead);