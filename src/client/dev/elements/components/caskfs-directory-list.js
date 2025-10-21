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

    this.pathStartIndex = 0;
    this.contents = [];
    this.selectedItems = [];
    this.totalPages = 1;

    this.appComponentCtl = new AppComponentController(this);
    this.directoryPathCtl = new DirectoryPathController(this);
    this.qsCtl = new QueryStringController(this);
    this.selectCtl = new DirectoryItemSelectController(this);
    this.scrollCtl = new ScrollController(this);

    this._injectModel('AppStateModel', 'DirectoryModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.appComponentCtl.isOnActivePage ) return;
    await this.listContents();

    if ( this.AppStateModel.store.data.lastLocation.pathname === e.location.pathname ) {
      window.scrollTo(0, 0);
      return;
    }

    // restore scroll position if returning to this page
    for ( const h of this.scrollCtl.pageHistory(e.page) ) {
      if ( this.directoryPathCtl.isAppStatePathEqual(h.location?.path) ) {

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

    await this.directoryPathCtl.updateComplete;
    await this.qsCtl.updateComplete;

    const res = await this.DirectoryModel.list(this.directoryPathCtl.pathname);
    if ( res.state !== 'loaded' ) {
      this.contents = [];
      return;
    }
    let contents = [];
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

    if ( this.qsCtl.query.sort ) {
      contents = this.qsCtl.multiSort(contents);
    }
    this.totalPages = this.qsCtl.maxPages(contents);
    this.contents = this.qsCtl.paginateData(contents);
  }

  _onItemClick(e){
    if ( e.detail.isDirectory ) {
      this.directoryPathCtl.setLocation(e.detail.data.name);
      return;
    }
    this.AppStateModel.setLocation(`/file${e.detail.data.filepath}`);
  }

  _onPageChange(e){
    this.qsCtl.setParam('page', e.detail.page);
    this.qsCtl.setLocation();
  }

}

customElements.define('caskfs-directory-list', CaskfsDirectoryList);