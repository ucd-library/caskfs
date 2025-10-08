import { LitElement } from 'lit';
import {render, styles} from "./caskfs-directory-item.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

export default class CaskfsDirectoryItem extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      data: { type: Object },
      hideSelect: { type: Boolean, attribute: 'hide-select' },
      selected: { type: Boolean },
      name: { state: true },
      isDirectory: { state: true }
    };
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.data = {};
    this.hideSelect = false;
    this.selected = false;

    this.setComputedProps();
  }

  willUpdate(props){
    if ( props.has('data') ) {
      this.setComputedProps();
    }
  }

  setComputedProps() {
    this.name = (this.data?.file_id ? this.data.filename : this.data?.name?.split('/').filter(Boolean).pop()) || '';
    this.isDirectory = !this.data?.file_id;

  }

  _onSelectToggle(e) {
    this.selected = !this.selected;
    this.dispatchEvent(new CustomEvent('select-toggle', {
      detail: {
        selected: this.selected,
        data: this.data
      }
    }));
  }

}

customElements.define('caskfs-directory-item', CaskfsDirectoryItem);