import { LitElement } from 'lit';
import {render, styles} from "./caskfs-lineage-details.tpl.js";

/**
 * @description Details view for a single lineage (derivative) link, shown inside a dialog
 * modal by caskfs-lineage-widget. Purely presentational — the widget owns the modal's action
 * buttons and toggles `confirming` to switch between the read-only details view and a delete
 * confirmation prompt within the same open modal.
 * @property {Object} item - display item with path, relation, metadata, created, link properties
 * @property {Boolean} confirming - if true, render the delete confirmation prompt instead of details
 */
export default class CaskfsLineageDetails extends LitElement {

  static get properties() {
    return {
      item: { type: Object },
      confirming: { type: Boolean }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.item = {};
    this.confirming = false;
  }

}

customElements.define('caskfs-lineage-details', CaskfsLineageDetails);
