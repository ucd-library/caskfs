import { LitElement } from 'lit';
import { render, styles } from "./cork-app-loader.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

export default class CorkAppLoader extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      fadeInDuration: {type: Number},
      fadeOutDuration: {type: Number},
      isDisplayed: {type: Boolean},
      _showPromise: {state: true},
      _hidePromise: {state: true}
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.fadeInDuration = 1;
    this.fadeOutDuration = 250;

    this._injectModel('AppStateModel');
  }

  _onAppLoadingUpdate(e) {
    if (e.show) {
      this.show();
    } else {
      this.hide();
    }
  }

  async show(opts={}) {
    if ( this._showPromise || this.isDisplayed ) return;
    if ( this._hidePromise ) await this._hidePromise;
    this._showPromise = this._show(opts);
  }

  async hide(opts={}) {
    if ( this._hidePromise ) return;
    if ( this._showPromise ) {
      await this._showPromise;
    } else if ( !this.isDisplayed ) {
      return;
    }
    this._hidePromise = this._hide(opts);
  }

  async _show(){
    this.style.opacity = 0;
    this.style.display = 'block';
    this.style.height = '100vh';
    document.body.style.overflow = 'hidden';
    const animation = this.animate([
      {opacity: 0},
      {opacity: 1}
    ], {
      duration: this.fadeInDuration,
      easing: 'ease-in-out'
    });
    await animation.finished;
    this.style.opacity = 1;
    this._showPromise = null;
    this.isDisplayed = true;
  }

  async _hide(){
    this.style.opacity = 1;
    const animation = this.animate([
      {opacity: 1},
      {opacity: 0}
    ], {
      duration: this.fadeOutDuration,
      easing: 'ease-in-out'
    });
    await animation.finished;
    this.style.opacity = 0;
    this.style.display = 'none';
    this.style.height = '0';
    document.body.style.overflow = '';
    this._hidePromise = null;
    this.isDisplayed = false;
  }

}

customElements.define('cork-app-loader', CorkAppLoader);
