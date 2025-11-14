import { LitElement } from 'lit';
import {render, styles} from "./caskfs-ld-filter-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

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

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.value = '';
    this.filter = '';
  }

  _onFormSubmit(e) {
    e?.preventDefault?.();
    if ( !this.filter || !this.value ) return;
    const filterObj = this.filters.find(f => f.value === this.filter);

    this.ctl.qs.setParam(filterObj.queryParam || filterObj.value, this.value);
    this.ctl.qs.setParam('page', 1);
    this.ctl.qs.setLocation();
  }

  _onFilterSelect(e){
    this.filter = e.target.value || '';
    const filterObj = this.filters.find(f => f.value === this.filter);
    this.multiple = filterObj?.multiple || false;
    this.value = this.ctl.qs.query[filterObj.queryParam || filterObj.value] || '';
  }

  _onValueInput(value, index){
    value = value.replaceAll(',', '');
    if ( !index ){
      this.value = value;
      return;
    }
    const values = this.value.split(',');
    values[index] = value;
    this.value = values.join(',');
  }

}

customElements.define('caskfs-ld-filter-form', CaskfsLdFilterForm);