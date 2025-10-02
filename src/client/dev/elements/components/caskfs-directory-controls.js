import { LitElement } from 'lit';
import {render, styles} from "./caskfs-directory-controls.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

export default class CaskfsDirectoryControls extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      sortOptions: {type: Array },
      sortValue: { type: String },
      sortIsDesc: { type: Boolean }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.sortOptions = [
      { label: 'Name', value: 'name' },
      { label: 'Last Modified', value: 'lastModified' }
    ];
    this.sortValue = '';
    this.sortIsDesc = false;
  }

  _onSortOptionSelect(e){
    this.sortValue = e.detail.value;
    this.sortIsDesc = e.detail.isDesc;
  }

}

customElements.define('caskfs-directory-controls', CaskfsDirectoryControls);