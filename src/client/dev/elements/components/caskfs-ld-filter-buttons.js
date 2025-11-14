import { LitElement } from 'lit';
import {render, styles} from "./caskfs-ld-filter-buttons.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import AppComponentController from '../../controllers/AppComponentController.js';

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

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.ctl.qs.updateComplete;
    const appliedFilters = [];
    for ( const filter of this.filters ) {
      const value = this.ctl.qs.query[filter.queryParam || filter.value];
      if ( value ) {
        appliedFilters.push({
          filter,
          value
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

  _onFilterClick(filter){
    this.ctl.qs.deleteParam(filter.filter.queryParam || filter.filter.value);
    this.ctl.qs.setParam('page', 1);
    this.ctl.qs.setLocation();
  }

}

customElements.define('caskfs-ld-filter-buttons', CaskfsLdFilterButtons);