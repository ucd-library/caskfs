import { LitElement } from 'lit';
import {render, styles} from "./caskfs-page-relationships.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

export default class CaskfsPageRelationships extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

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

  }

}

customElements.define('caskfs-page-relationships', CaskfsPageRelationships);