import { LitElement } from 'lit';
import { render } from "./caskfs-directory-list.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';
import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import QueryStringController from '../../controllers/QueryStringController.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import ScrollController from '../../controllers/ScrollController.js';

export default class CaskfsDirectoryList extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      contents: { type: Array },
      selectedItems: { type: Array },
      totalPages: { type: Number }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.contents = [];
    this.selectedItems = [];
    this.totalPages = 1;

    this.ctl = {
      appComponent: new AppComponentController(this),
      directoryPath: new DirectoryPathController(this),
      qs: new QueryStringController(this, { types: { partition: 'array'}}),
      select: new DirectoryItemSelectController(this),
      scroll: new ScrollController(this)
    };

    this._injectModel('AppStateModel', 'DirectoryModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.listContents();

    if ( this.AppStateModel.store.data.lastLocation.pathname === e.location.pathname ) {
      window.scrollTo(0, 0);
      return;
    }

    // restore scroll position if returning to this page
    for ( const h of this.ctl.scroll.pageHistory(e.page) ) {
      if ( this.ctl.directoryPath.isAppStatePathEqual(h.location?.path) ) {

        // give the page a chance to render
        this.requestUpdate();
        await this.updateComplete;
        
        h.scrollTo();
        break;
      }
    }
  }

  async listContents() {
    this.selectedItems = [];

    await this.ctl.directoryPath.updateComplete;
    await this.ctl.qs.updateComplete;

    this.ctl.qs.pageSize = this.ctl.qs.query.limit || 20;
    const query = {
      offset: this.ctl.qs.pageOffset,
      limit: this.ctl.qs.pageSize
    };
    if ( this.ctl.qs.query.query ){
      query.query = this.ctl.qs.query.query;
    }
    const res = await this.DirectoryModel.list(this.ctl.directoryPath.pathname, query);
    if ( res.state !== 'loaded' ) {
      this.contents = [];
      return;
    }
    let contents = [];
    for ( const dir of res.payload.directories ) {
      contents.push({
        data: dir,
        name: dir.name.split('/').filter(Boolean).pop(),
        lastModified: new Date(Math.round(new Date(dir.modified).getTime() / 1000) * 1000),
        size: 0,
        kind: 'directory',
        modifiedBy: ''
      });
    }

    for ( const file of res.payload.files ) {
      contents.push({
        data: file,
        name: file.filename,
        lastModified: new Date(Math.round(new Date(file.modified).getTime() / 1000) * 1000),
        size: Number(file.size),
        kind: file.meta_data?.mimeType || '',
        modifiedBy: file.last_modified_by || ''
      });
    }


    // if ( this.ctl.qs.query.sort ) {
    //   contents = this.ctl.qs.multiSort(contents);
    // }
    this.totalPages = this.ctl.qs.maxPages(res.payload.totalCount);
    this.contents = contents;
  }

  _onPageChange(e){
    this.ctl.qs.setParam('page', e.detail.page);
    this.ctl.qs.setLocation();
  }

}

customElements.define('caskfs-directory-list', CaskfsDirectoryList);