import { LitElement } from 'lit';
import { render } from "./caskfs-directory-list.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';
import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import DirectoryListController from '../../controllers/DirectoryListController.js';
import QueryStringController from '../../controllers/QueryStringController.js';
import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import ScrollController from '../../controllers/ScrollController.js';
import appUrlUtils from '../../utils/appUrlUtils.js';

export default class CaskfsDirectoryList extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.ctl = {
      appComponent: new AppComponentController(this),
      directoryPath: new DirectoryPathController(this),
      qs: new QueryStringController(this, { types: { partition: 'array'}}),
      select: new DirectoryItemSelectController(this),
      scroll: new ScrollController(this),
      directoryList: new DirectoryListController(this)
    };

    this._injectModel('AppStateModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    await this.ctl.directoryList.getContents();

    if ( !e.scrollToLastPosition && this.AppStateModel.store.data.lastLocation.pathname === e.location.pathname ) {
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

  _onPageChange(e){
    this.ctl.qs.setParam('page', e.detail.page);
    this.ctl.qs.setLocation();
  }

  _onSearchSubmit(e) {
    let path = e.detail.value;
    if ( !path.startsWith('/') ) {
      path = '/' + path;
    }
    this.AppStateModel.setLocation(appUrlUtils.fullLocation(`/directory${path}`));
  }

  /**
   * @description Handle selection from typeahead search of directory contents
   * @param {*} e 
   */
  _onSearchSelect(e) {
    if ( e.detail?.suggestion.isDirectory ) return;
    this.AppStateModel.setLocation(appUrlUtils.fullLocation(`/file${e.detail.suggestion.metadata.filepath}`));
  }

}

customElements.define('caskfs-directory-list', CaskfsDirectoryList);