import { LitElement } from 'lit';
import {render} from "./caskfs-file-search-results.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';
import QueryStringController from '../../controllers/QueryStringController.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import ScrollController from '../../controllers/ScrollController.js';

export default class CaskfsFileSearchResults extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      results: { type: Array },
      selectedItems: { type: Array },
      totalPages: { type: Number }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.results = [];
    this.selectedItems = [];
    this.totalPages = 1;

    this.ctl = {
      appComponent: new AppComponentController(this),
      qs: new QueryStringController(this, { types: { partition: 'array'}}),
      select: new DirectoryItemSelectController(this),
      scroll: new ScrollController(this)
    }

    this._injectModel('AppStateModel', 'LdModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.getResults();

    if ( this.AppStateModel.store.data.lastPage === e.page ) {
      window.scrollTo(0, 0);
      return;
    }

    // restore scroll position if returning to this page
    for ( const h of this.ctl.scroll.pageHistory(e.page) ) {
      if ( h.queryEquals(e.location.query) ) {

        // give the page a chance to render
        this.requestUpdate();
        await this.updateComplete;
        
        h.scrollTo();
        break;
      }
    }
  }

  async getResults(){
    this.results = [];

    await this.ctl.qs.updateComplete;
    this.ctl.qs.pageSize = this.ctl.qs.query.limit || 20;

    const query = {
      ...this.ctl.qs.query,
      offset: this.ctl.qs.pageOffset,
      limit: this.ctl.qs.pageSize,
    }
    if ( this.ctl.qs.query.partition?.length ) {
      query.partitionKeys = this.ctl.qs.query.partition;
    }
    const res = await this.LdModel.find(query);
        if ( res.state !== 'loaded' ) {
      this.results = [];
      return;
    }

    this.results = res.payload.results || [];
    this.totalPages = this.ctl.qs.maxPages(res.payload.totalCount);
  }

  _onPageChange(e) {
    this.ctl.qs.setParam('page', e.detail.page);
    this.ctl.qs.setLocation();
  }

}

customElements.define('caskfs-file-search-results', CaskfsFileSearchResults);