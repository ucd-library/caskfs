import { LitElement } from 'lit';
import {render, styles} from "./caskfs-ld-filter-buttons.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

/**
 * @typedef {Object} FilterDefinition
 * @property {String} value - The filter value (e.g. 'subject', 'predicate', etc.)
 * @property {String} label - The human readable label for the filter
 * @property {Boolean} [multiple] - Whether the filter supports multiple values
 * @property {String} [queryParam] - The query param to use instead of the value
 */

/**
 * @description Component for displaying applied Linked Data filters as buttons that can be removed
 * @param {FilterDefinition[]} filters - Array of filter definitions
 */
export default class CaskfsLdFilterButtons extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      filters: { type: Array },
      appliedFilters: { state: true },
      hasFilters: { type: Boolean, attribute: 'has-filters', reflect: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.filters = [
      { value: 'subject', label: 'Subject' },
      { value: 'predicate', label: 'Predicate' },
      { value: 'object', label: 'Object' },
      { value: 'graph', label: 'Graph' },
      { value: 'type', label: 'Type' }
    ];

    this.appliedFilters = [];

    this.ctl = {
      qs: new QueryStringController(this),
      appComponent: new AppComponentController(this)
    }

    this._injectModel('AppStateModel');
  }

  /**
   * @description Update applied filters when app state changes
   */
  async _onAppStateUpdate() {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.ctl.qs.updateComplete;
    const appliedFilters = [];
    for ( const filter of this.filters ) {
      let value = this.ctl.qs.query[filter.queryParam || filter.value];
      if (!value) continue;
      const values = filter.multiple ? value.split(',') : [value];
      for ( const [i, v] of values.entries() ) {
        appliedFilters.push({
          filter,
          value: v,
          values: values,
          index: i
        });
      }
    }
    this.appliedFilters = appliedFilters;
  }

  willUpdate(props){
    if ( props.has('appliedFilters') ) {
      this.hasFilters = this.appliedFilters.length > 0;
    }
  }

  /**
   * @description Handle filter button clicks. Removes the filter from the query string.
   * @param {Object} filter - Object from this.appliedFilters array
   */
  _onFilterClick(filter){
    const queryParam = filter.filter.queryParam || filter.filter.value;
    if ( filter.filter.multiple ) {
      const existingValues = this.ctl.qs.query[queryParam];
      const values = existingValues ? existingValues.split(',') : [];
      values.splice(values.indexOf(filter.value), 1);
      this.ctl.qs.setParam(queryParam, values.join(','));
    } else {
      this.ctl.qs.deleteParam(queryParam);
    }
    this.ctl.qs.setParam('page', 1);
    this.ctl.qs.setLocation();

    this.dispatchEvent(new CustomEvent('caskfs-ld-filter-removed', {
      detail: { filter },
      bubbles: true,
      composed: true
    }));
  }

}

customElements.define('caskfs-ld-filter-buttons', CaskfsLdFilterButtons);