import { LitElement } from 'lit';
import {render, styles} from "./caskfs-directory-simple-list.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';
import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import QueryStringController from '../../controllers/QueryStringController.js';
import DirectoryListController from '../../controllers/DirectoryListController.js';
import ScrollController from '../../controllers/ScrollController.js';

import uploadUtils from '../../utils/uploadUtils.js';
import FsDisplayUtils from '../../utils/FsDisplayUtils.js';

export default class CaskfsDirectorySimpleList extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      dragging: { type: Boolean },
      dragZoneHeight: { type: Number },
      dragZonePaddingTop: { type: Number },
      hasParentFile: { type: Boolean },
      parentFile: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.dragging = false;
    this.dragZoneHeight = 200;
    this.dragZonePaddingTop = 0;
    this.hasParentFile = false;
    this.parentFile = null;

    this.ctl = {
      appComponent: new AppComponentController(this),
      directoryPath: new DirectoryPathController(this),
      qs: new QueryStringController(this, { types: { partition: 'array'}}),
      scroll: new ScrollController(this),
      directoryList: new DirectoryListController(this)
    };

    this._injectModel('AppStateModel', 'FsModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;

    this.hasParentFile = false;
    this.parentFile = null;
    const parentFileRes = await this.FsModel.getMetadata(this.ctl.directoryPath.parentPath, { errorSettings: { suppressError: true } });
    if ( parentFileRes.state === 'loaded') {
      this.hasParentFile = true;
      this.parentFile = new FsDisplayUtils(parentFileRes.payload);

    }

    await this.ctl.directoryList.getContents( {asDisplayItems: true, parent: this.hasParentFile} );

    if ( e.location.pathname === e.lastLocation.pathname && e.location.query.page !== e.lastLocation.query.page ) {
      this.requestUpdate();
      await this.updateComplete;

      this.ctl.scroll.scrollToTopOfElement();
    }
  }

  /**
   * @description Handle dragover event on page. Used to upload files
   * @param {*} e 
   */
  _onDragOver(e) {
    e.preventDefault();
    const dragZone = this.renderRoot.querySelector('.contents');
    const rect = dragZone.getBoundingClientRect();
    const diff = Math.round(window.innerHeight - rect.top);
    const height = Math.round(rect.height);
    this.dragZoneHeight = Math.min(diff, height);
    this.dragZonePaddingTop = Math.round(Math.max(0, -rect.top));
    this.dragging = true;
  }

  /**
   * @description Handle dragleave event on page.
   */
  _onDragLeave(e) {
    const dragZone = this.renderRoot.querySelector('.contents');
    if (dragZone.contains(e.relatedTarget)) return;
    this.dragging = false;
  }

  _onPageChange(e){
    this.ctl.qs.setParam('page', e.detail.page);
    this.ctl.qs.setLocation();
  }

  async _onDrop(e) {
    e.preventDefault();
    this.dragging = false;
    const files = await uploadUtils.getFilesFromDragEvent(e);
    const results = await this.FsModel.upload(files, this.hasParentFile ? this.ctl.directoryPath.parentPath : this.ctl.directoryPath.pathname);
    if ( results.some( r => r.state === 'loaded' )) {
      this.AppStateModel.refresh();
    }
  }

}

customElements.define('caskfs-directory-simple-list', CaskfsDirectorySimpleList);