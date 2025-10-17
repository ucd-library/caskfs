import { LitElement } from 'lit';
import {render, styles} from "./caskfs-section-header.tpl.js";

export default class CaskfsSectionHeader extends LitElement {

  static get properties() {
    return {
      text: { type: String },
      icon: { type: String },
      brandColor: { type: String, attribute: 'brand-color' }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.text = '';
    this.icon = '';
    this.brandColor = '';
  }

}

customElements.define('caskfs-section-header', CaskfsSectionHeader);