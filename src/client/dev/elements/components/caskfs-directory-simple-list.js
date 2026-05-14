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

/**
 * @description Displays a simplified list of files in a directory, along with upload functionality.
 * On single file page, used to display either:
 * 1. file subdirectory contents if regular file, or
 * 2. sibling content if file is part of a file subdirectory
 * @property {Boolean} dragging - whether a file is currently being dragged over the page
 * @property {Number} dragZoneHeight - height of the drag zone, which changes based on the position of the drag event
 * @property {Number} dragZonePaddingTop - padding top of the drag zone, which changes based on the position of the drag event
 * @property {Boolean} hasParentFile - whether the current directory has a parent file (i.e. whether we are showing sibling content or subdirectory content)
 * @property {Object} parentFile - display object for parent file, if it exists
 */
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
    if (this.ctl.directoryPath.parentPath !== '/' ){
      const parentFileRes = await this.FsModel.getMetadata(this.ctl.directoryPath.parentPath, { errorSettings: { suppressError: true } });
      if ( parentFileRes.state === 'loaded') {
        this.hasParentFile = true;
        this.parentFile = new FsDisplayUtils(parentFileRes.payload);
      }
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

  /**
   * @description Handle page change event from pagination component
   * @param {CustomEvent} e - Page change event
   */
  _onPageChange(e){
    this.ctl.qs.setParam('page', e.detail.page);
    this.ctl.qs.setLocation();
  }

  /**
   * @description Handle drop event on component. Used to upload files
   * @param {Event} e - Drop event
   */
  async _onDrop(e) {
    e.preventDefault();
    this.dragging = false;
    const files = await uploadUtils.getFilesFromDragEvent(e);
    const results = await this.FsModel.upload(files, this.hasParentFile ? this.ctl.directoryPath.parentPath : this.ctl.directoryPath.pathname);
    if ( results.some( r => r.state === 'loaded' )) {
      this._onAppStateUpdate(this.AppStateModel.store.data);
    }
  }

}

customElements.define('caskfs-directory-simple-list', CaskfsDirectorySimpleList);