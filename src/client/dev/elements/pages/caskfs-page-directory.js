import { LitElement } from 'lit';
import {render, styles} from "./caskfs-page-directory.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import uploadUtils from '../../utils/uploadUtils.js';

export default class CaskfsPageDirectory extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      dragging: { type: Boolean },
      dragZoneHeight: { type: Number }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.dragging = false;
    this.dragZoneHeight = 200;
  }

  /**
   * @description Handle dragover event on page. Used to upload files
   * @param {*} e 
   */
  _onDragOver(e) {
    e.preventDefault();
    this.dragZoneHeight = Math.round(window.innerHeight - this.getBoundingClientRect().top);
    this.dragging = true;
  }

  /**
   * @description Handle dragleave event on page.
   */
  _onDragLeave() {
    this.dragging = false;
  }

  async _onDrop(e) {
    e.preventDefault();
    this.dragging = false;
    const files = await uploadUtils.getFilesFromDragEvent(e);
    console.log('files to upload', files);
  }

}

customElements.define('caskfs-page-directory', CaskfsPageDirectory);