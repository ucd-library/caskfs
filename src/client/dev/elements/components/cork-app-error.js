import { LitElement } from 'lit';
import { render, styles } from "./cork-app-error.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';


export default class CorkAppError extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      heading: {type: String},
      errors: {state: true},
      showLoginButton: {type: Boolean},
      badAuth: {state: true}
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.heading = 'Error';
    this.errors = [];
    this.showLoginButton = false;
    this.badAuth = false;

    this._injectModel('AppStateModel');
  }

  _onAppErrorUpdate(e){
    if ( e.show ) {
      this.show(e.opts);
    } else {
      this.hide();
    }
  }

  show(opts={}){
    this.style.display = 'block';
    document.body.style.overflow = 'hidden';
    if ( opts.requests ) {
      this.errors = opts.requests.map(error => this.formatError(error));
    } else if ( opts.message ) {
      this.errors = [this.formatError({errorMessage: opts.message})];
    } else {
      this.errors = [];
    }
    this.heading = opts.heading || this.getDefaultHeading();
  }

  hide(){
    this.style.display = 'none';
    document.body.style.overflow = '';
  }

  getDefaultHeading(){
    if ( this.errors.length > 1 ){
      return 'Multiple errors occurred while loading the page';
    } else {
      return 'An error occurred while loading the page';
    }
  }

  formatError(error){
    const serviceError = error?.payload?.error || {};
    const url = serviceError?.response?.url;
    const statusCode = serviceError?.response?.status || '';

    const details = serviceError?.payload;
    const heading = error?.errorMessage ||
      error?.errorSettings?.message ||
      details?.message ||
      serviceError?.message ||
      'Unknown error';

    if ( details?.stack ){
      details.stack = details.stack.replaceAll('\n', '<br/>')
    }

    const out = {
      heading,
      url,
      showDetails: false,
      statusCode,
      details
    };



    return out;
  }

  toggleDetails(error){
    error.showDetails = !error.showDetails;
    this.requestUpdate();
  }

}

customElements.define('cork-app-error', CorkAppError);
