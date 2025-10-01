import { LitElement } from 'lit';
import {render, styles} from "./cork-app-toast.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { WaitController } from "@ucd-lib/theme-elements/utils/controllers/wait.js";

/**
 * @description A toast notification system for the app. See AppStateModel.showToast() for usage.
 * @prop {Array} queue - queue of toasts to display
 * @prop {Number} defaultDisplayTime - default time to display a toast
 * @prop {Number} defaultAnimationTime - default time for toast animation
 * @prop {Boolean} processingQueue - flag for if the queue is currently being processed
 * @prop {Object} currentToast - the current toast being displayed
 */
export default class CorkAppToast extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      queue: { type: Array },
      defaultDisplayTime: { type: Number, attribute: 'default-display-time' },
      defaultAnimationTime: { type: Number, attribute: 'default-animation-time' },
      processingQueue: { type: Boolean },
      currentToast: { type: Object }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.queue = [];
    this.defaultDisplayTime = 5000;
    this.defaultAnimationTime = 300;
    this.processingQueue = false;
    this.currentToast = null;

    this.registry = [
      {name: 'basic', icon: null, brandColor: null, isDefault: true},
      {name: 'success', icon: 'fas.check', brandColor: 'quad'},
      {name: 'error', icon: 'fas.xmark', brandColor: 'double-decker'}
    ];

    this._injectModel('AppStateModel');

    this.wait = new WaitController(this);
  }

  _onAppToastShow(e) {
    this.show(e);
  }

  show(opts={}){
    if ( typeof opts === 'string' ) opts = {text: opts};
    if ( !opts.text ){
      this.logger.warn('AppToast.show() called without text');
      return;
    }
    if ( !opts.type ) opts.type = this.registry.find(item => item.isDefault).name;
    const registryItem = this.registry.find(item => item.name === opts.type);
    if ( !registryItem ) {
      this.logger.warn('AppToast.show() called with invalid type', opts.type);
      return;
    }

    this.queue.push({
      ...registryItem,
      displayTime: this.defaultDisplayTime,
      animationTime: this.defaultAnimationTime,
      ...opts});
    this.processQueue();
  }

  async processQueue(){
    if ( this.processingQueue ) return;
    this.processingQueue = true;
    while( this.queue.length ) {
      const item = this.queue[0];
      this.queue = this.queue.slice(1);
      await this._show(item);
    }
    this.processingQueue = false;
  }

  async _show(item){
    this.currentToast = item;
    const fadeIn = this.animate([
      {opacity: 0, bottom: '-100%'},
      {opacity: 1, bottom: '2rem'}
    ], {
      duration: item.animationTime,
      easing: 'ease-in-out'
    });
    await fadeIn.finished;
    await this.wait.wait(item.displayTime);
    const fadeOut = this.animate([
      {opacity: 1, bottom: '2rem'},
      {opacity: 0, bottom: '-100%'}
    ], {
      duration: item.animationTime,
      easing: 'ease-in-out'
    });
    await fadeOut.finished;
    this.currentToast = null;
  }

}

customElements.define('cork-app-toast', CorkAppToast);
