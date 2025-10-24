import { LitElement } from 'lit';
import {render, styles} from "./caskfs-section-header.tpl.js";

export default class CaskfsSectionHeader extends LitElement {

  static get properties() {
    return {
      text: { type: String },
      icon: { type: String },
      brandColor: { type: String, attribute: 'brand-color' },
      headingStyle: { type: String, attribute: 'heading-style' },
      hideSeparator: { type: Boolean, attribute: 'hide-separator' },
      _headingClass: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  willUpdate(props){
    if ( props.has('headingStyle') ) {
      const validStyles = {
        'h2': 'h2',
        'panel': 'panel__title'
      }
      if ( !this.headingStyle ) {
        this.headingStyle = 'h2';
      }
      if ( !validStyles[this.headingStyle] ) {
        console.warn(`Invalid heading-style "${this.headingStyle}" on <caskfs-section-header>. Defaulting to "h2". Valid styles are: ${Object.keys(validStyles).join(', ')}`);
        this.headingStyle = 'h2';
      }
      this._headingClass = validStyles[this.headingStyle];
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.text = '';
    this.icon = '';
    this.brandColor = '';
    this.headingStyle = '';
    this.hideSeparator = false;
  }

}

customElements.define('caskfs-section-header', CaskfsSectionHeader);