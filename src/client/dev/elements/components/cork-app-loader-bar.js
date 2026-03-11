import { LitElement } from 'lit';
import {render, styles} from "./cork-app-loader-bar.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

export default class CorkAppLoaderBar extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      isDisplayed: {type: Boolean},
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.isDisplayed = false;

    this._injectModel('AppStateModel');
  }

  _onAppLoadingUpdate(e) {
    if (e.show) {
      this.show();
    } else {
      this.hide();
    }
  }

  show() {
    this.isDisplayed = true;
    const main = this.closest('main');
    if ( main ) {
      main.setAttribute('aria-busy', 'true');
    }
  }

  hide() {
    this.isDisplayed = false;
    const main = this.closest('main');
    if ( main ) {
      main.removeAttribute('aria-busy');
    }
  }

}

customElements.define('cork-app-loader-bar', CorkAppLoaderBar);