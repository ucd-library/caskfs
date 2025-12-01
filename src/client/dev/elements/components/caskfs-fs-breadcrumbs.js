import { LitElement } from 'lit';
import {render, styles} from "./caskfs-fs-breadcrumbs.tpl.js";

import DirectoryPathController from '../../controllers/DirectoryPathController.js';

export default class CaskfsFsBreadcrumbs extends LitElement {

  static get properties() {
    return {
      
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.ctl = {
      directoryPath: new DirectoryPathController(this)
    };
  }

}

customElements.define('caskfs-fs-breadcrumbs', CaskfsFsBreadcrumbs);