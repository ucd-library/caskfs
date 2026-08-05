import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-lineage-widget.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import AppComponentController from '../../controllers/AppComponentController.js';
import DirectoryPathController from '../../controllers/DirectoryPathController.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

import './caskfs-lineage-add-form.js';
import './caskfs-lineage-details.js';

/**
 * @description Sidebar widget on the file landing page showing structural lineage links —
 * files this file was derived from (sources) and files derived from this file (derivatives).
 * Kept separate from the Layer 3 RDF relationships widget; see docs/structural-metadata.md.
 */
export default class CaskfsLineageWidget extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      sources: { state: true },
      derivatives: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.sources = [];
    this.derivatives = [];

    this.ctl = {
      appComponent: new AppComponentController(this),
      directoryPath: new DirectoryPathController(this)
    };

    this._injectModel('AppStateModel', 'LineageModel');
  }

  async _onAppStateUpdate() {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.getData();
  }

  async getData(){
    await this.ctl.directoryPath.updateComplete;
    this.sources = [];
    this.derivatives = [];
    if ( this.ctl.directoryPath.emptyOrRoot ) return;

    const path = this.ctl.directoryPath.pathname;
    const appStateOptions = { errorSettings: { suppressError: true }, loaderSettings: { suppressLoader: true } };

    const [sourcesRes, derivativesRes] = await Promise.all([
      this.LineageModel.getSources(path, {}, appStateOptions),
      this.LineageModel.getDerivatives(path, {}, appStateOptions)
    ]);

    if ( sourcesRes.state === 'loaded' ) {
      this.sources = (sourcesRes.payload || []).map(row => this._toDisplayItem(row, row.to_filepath));
    }
    if ( derivativesRes.state === 'loaded' ) {
      this.derivatives = (derivativesRes.payload || []).map(row => this._toDisplayItem(row, row.from_filepath));
    }
  }

  /**
   * @description Convert a derivative_link_view row into a display item, resolved against
   * whichever end of the link ("from" or "to") is the *other* file relative to this page.
   * Carries fromPath/toPath through unchanged so the link can be removed later without
   * needing to re-derive direction from which list ("sources" or "derivatives") it came from.
   * @param {Object} row - derivative_link_view row
   * @param {String} otherPath - the other file's current filepath
   */
  _toDisplayItem(row, otherPath){
    return {
      id: row.derivative_link_id,
      path: otherPath,
      name: otherPath.split('/').filter(Boolean).pop() || otherPath,
      relation: row.relation,
      metadata: row.metadata,
      created: row.created,
      link: appUrlUtils.fullLocation(`/file${otherPath}`),
      fromPath: row.from_filepath,
      toPath: row.to_filepath
    };
  }

  _onItemClick(item){
    this.AppStateModel.showDialogModal({
      title: item.name,
      actions: this._detailsActions(),
      actionCallback: (actionValue, modal) => this._onDetailsAction(actionValue, item, modal),
      content: () => html`<caskfs-lineage-details .item=${item}></caskfs-lineage-details>`
    });
  }

  _detailsActions(){
    return [
      {text: 'Close', value: 'dismiss', invert: true, color: 'secondary'},
      {text: 'Delete', value: 'delete', disableOnLoading: true}
    ];
  }

  _confirmDeleteActions(){
    return [
      {text: 'Cancel', value: 'cancel-delete', invert: true, color: 'secondary'},
      {text: 'Confirm Delete', value: 'confirm-delete', disableOnLoading: true}
    ];
  }

  /**
   * @description Handle button clicks from the lineage-details dialog. 'dismiss' (Close) is
   * handled entirely by the dialog itself. 'delete'/'cancel-delete' swap the modal's actions
   * and the details view's confirming state in place, within the same open modal — see the
   * user's request for why a second stacked modal isn't used (only one dialog element exists
   * app-wide; reopening it while already open throws). 'confirm-delete' performs the removal.
   * @param {String} actionValue
   * @param {Object} item - display item, see _toDisplayItem
   * @param {Object} modal - the cork-app-dialog-modal instance
   * @returns {Object|undefined} {abortModalAction: true} to keep the modal open
   */
  async _onDetailsAction(actionValue, item, modal){
    if ( actionValue === 'delete' ) {
      this._setConfirming(modal, true);
      return { abortModalAction: true };
    }

    if ( actionValue === 'cancel-delete' ) {
      this._setConfirming(modal, false);
      return { abortModalAction: true };
    }

    if ( actionValue === 'confirm-delete' ) {
      modal.loading = true;
      const r = await this.LineageModel.removeLink(item.fromPath, item.toPath, { relation: item.relation });
      modal.loading = false;

      if ( r.state !== 'loaded' ) {
        return { abortModalAction: true };
      }

      this.AppStateModel.showToast({text: 'Lineage link removed', type: 'success'});
      this.AppStateModel.refresh();
      return;
    }
  }

  _setConfirming(modal, confirming){
    modal.actions = confirming ? this._confirmDeleteActions() : this._detailsActions();
    const detailsEl = modal.renderRoot?.querySelector('caskfs-lineage-details');
    if ( detailsEl ) detailsEl.confirming = confirming;
  }

  _onAddClick(direction){
    const currentPath = this.ctl.directoryPath.pathname;
    this.AppStateModel.showDialogModal({
      content: () => html`
        <caskfs-lineage-add-form direction=${direction} current-path=${currentPath}></caskfs-lineage-add-form>
      `
    });
  }

}

customElements.define('caskfs-lineage-widget', CaskfsLineageWidget);
