import { LitElement } from 'lit';
import {render, styles} from "./caskfs-directory-controls.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import QueryStringController from '../../controllers/QueryStringController.js';

export default class CaskfsDirectoryControls extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      sortOptions: {type: Array },
      sortValue: { type: String },
      sortIsDesc: { type: Boolean },
      pathStartIndex: { type: Number, attribute: 'path-start-index' }
    };
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.pathStartIndex = 0;

    this.sortOptions = [
      { label: 'Name', value: 'name' },
      { label: 'Last Modified', value: 'lastModified' },
      { label: 'Size', value: 'size' }
    ];
    this.sortValue = '';
    this.sortIsDesc = false;

    this.directoryPathCtl = new DirectoryPathController(this, 'pathStartIndex');
    this.qsCtl = new QueryStringController(this);
  }

  _onSortOptionSelect(e){
    this.qsCtl.setParam('sort', e.detail.value);
    if ( e.detail.isDesc ) {
      this.qsCtl.setParam('sortDirection', 'desc');
    } else {
      this.qsCtl.deleteParam('sortDirection');
    }
    this.qsCtl.setLocation();
  }

}

customElements.define('caskfs-directory-controls', CaskfsDirectoryControls);