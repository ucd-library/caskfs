import { LitElement } from 'lit';
import {render, styles} from "./caskfs-av-player.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

/**
 * @description A simple audio/video player component that wraps the native HTML5 audio and video players. 
 * @property {Boolean} video - Whether the source is a video or audio file. Determines whether to render a video or audio player.
 * @property {String} src - The URL of the media file to play.
 */
export default class CaskfsAvPlayer extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      video: { type: Boolean },
      src: { type: String }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.video = false;
    this.src = '';

    this._injectModel('AppStateModel');
  }

  _onAppStateUpdate() {
    this.player?.pause();
  }

  get player(){
    return this.video ? this.renderRoot.querySelector('video') : this.renderRoot.querySelector('audio');
  }

}

customElements.define('caskfs-av-player', CaskfsAvPlayer);