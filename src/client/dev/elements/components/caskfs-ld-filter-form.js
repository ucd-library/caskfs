import { LitElement } from 'lit';
import {render, styles} from "./caskfs-ld-filter-form.tpl.js";

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
 * @description Component for applying Linked Data filters via query string
 * @param {String} value - The current filter value. For multiple filters, values are comma separated
 * @param {String} filter - The current filter type (value from FilterDefinition)
 * @param {FilterDefinition[]} filters - Array of filter definitions
 * @param {Boolean} multiple - Whether the current filter supports multiple values
 */
export default class CaskfsLdFilterForm extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      value: { type: String },
      filter: { type: String },
      filters: { type: Array },
      multiple: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.value = '';
    this.filter = '';
    this.filters = [
      { value: 'subject', label: 'Subject' },
      { value: 'predicate', label: 'Predicate' },
      { value: 'object', label: 'Object' },
      { value: 'graph', label: 'Graph' },
      { value: 'type', label: 'Type' }
    ];
    this.multiple = false;

    this.ctl = {
      qs: new QueryStringController(this),
      appComponent: new AppComponentController(this)
    }

    this._injectModel('AppStateModel');
  }

  /**
   * @description Reset form when app state changes
   * @returns 
   */
  async _onAppStateUpdate() {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.value = '';
    this.filter = '';
    this.multiple = false;
  }

  /**
   * @description Handle form submission. Sets the query string parameter for the selected filter.
   * @param {*} e 
   * @returns 
   */
  _onFormSubmit(e) {
    e?.preventDefault?.();
    if ( !this.filter || !this.value ) return;
    const filterObj = this.filters.find(f => f.value === this.filter);

    this.ctl.qs.setParam(filterObj.queryParam || filterObj.value, this.value);
    this.ctl.qs.setParam('page', 1);
    this.ctl.qs.setLocation();
  }

  /**
   * @description Handle filter selection changes. e.g. selecting 'predicate' from the dropdown
   * @param {*} e 
   */
  _onFilterSelect(e){
    this.filter = e.target.value || '';
    const filterObj = this.filters.find(f => f.value === this.filter);
    this.multiple = filterObj?.multiple || false;
    this.value = this.ctl.qs.query[filterObj.queryParam || filterObj.value] || '';
  }

  /**
   * @description Handle clicks on the "Add Another" button for adding multiple filter values
   * @returns 
   */
  _onMultipleAddClick(){
    if ( !this.multiple ) return;
    const values = this.value ? this.value.split(',') : [''];
    values.push('');
    this.value = values.join(',');
  }

  /**
   * @description Handle removing a value from the multiple values list by index
   * @param {Number} index - Index of the value to remove
   * @returns 
   */
  removeValueByIndex(index){
    if ( !this.multiple ) return;
    const values = this.value.split(',');
    values.splice(index, 1);
    this.value = values.join(',');
  }

  /**
   * @description Handle input changes for filter value(s)
   * @param {String} value - The new value
   * @param {Number} index - The index of the value being changed (for multiple values)
   * @returns 
   */
  _onValueInput(value, index){
    value = this.multiple ? value.replaceAll(',', '') : value;
    if ( !this.multiple ){
      this.value = value;
      return;
    }
    const values = this.value.split(',');
    values[index] = value;
    this.value = values.join(',');
  }

}

customElements.define('caskfs-ld-filter-form', CaskfsLdFilterForm);