import { LitElement } from 'lit';
import {render, styles} from "./caskfs-fs-items.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';

export default class CaskfsFsItems extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      items: { type: Array },
      view: { type: String },
      showDirectoryLink: { type: Boolean, attribute: 'show-directory-link' },
      hideTypeIcon: { type: Boolean, attribute: 'hide-type-icon' }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.items = [];
    this.showDirectoryLink = false;
    this.hideTypeIcon = false;
    this.view = '';

    this.ctl = {
      select: new DirectoryItemSelectController(this)
    }

    this.views = [ 'full', 'simple' ];
  }

  willUpdate(props){
    if ( props.has('view') ) {
      if ( !this.views.includes(this.view) ) {
        this.view = this.views[0];
      }
    }
  }

}

customElements.define('caskfs-fs-items', CaskfsFsItems);