import { LitElement } from 'lit';
import { render } from "./caskfs-directory-list.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import AppComponentController from '../../controllers/AppComponentController.js';
import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import QueryStringController from '../../controllers/QueryStringController.js';

export default class CaskfsDirectoryList extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      pathStartIndex: { type: Number, attribute: 'path-start-index' },
      contents: { type: Array },
      selectedItems: { type: Array }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.pathStartIndex = 0;
    this.contents = [];
    this.selectedItems = [];

    this.appComponentCtl = new AppComponentController(this);
    this.directoryPathCtl = new DirectoryPathController(this, 'pathStartIndex');
    this.qsCtl = new QueryStringController(this);

    this._injectModel('AppStateModel', 'DirectoryModel');
  }

  _onAppStateUpdate(e) {
    if ( !this.appComponentCtl.isOnActivePage ) return;
    this.listContents();
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
        lastModified: new Date(file.modified),
        size: Number(file.size)
      });
    }
    for ( const dir of res.payload.directories ) {
      contents.push({
        data: dir,
        name: dir.name.split('/').filter(Boolean).pop(),
        lastModified: new Date(dir.modified),
        size: 0
      });
    }

    if ( this.qsCtl.query.sort ) {
      contents.sort((a, b) => {
        const aVal = a[this.qsCtl.query.sort];
        const bVal = b[this.qsCtl.query.sort];
        const sortDirection = this.qsCtl.query.sortDirection === 'desc' ? -1 : 1;
        if ( aVal < bVal ) return -1 * sortDirection;
        if ( aVal > bVal ) return 1 * sortDirection;
        return 0;
      });
    }

    this.contents = contents;
  }

  _onItemClick(e){
    if ( e.detail.isDirectory ) {
      this.directoryPathCtl.setLocation(e.detail.data.name);
      return;
    }
    console.log('File clicked', e.detail);
  }

}

customElements.define('caskfs-directory-list', CaskfsDirectoryList);