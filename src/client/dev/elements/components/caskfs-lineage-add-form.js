import { LitElement } from 'lit';
import {render, styles} from "./caskfs-lineage-add-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import ModalFormController from '../../controllers/ModalFormController.js';

import './caskfs-fs-typeahead.js';

/**
 * @description Modal form for adding a lineage (derivative) link between the current file
 * (current-path) and another file selected via typeahead.
 * direction='source' records that the current file was derived from the selected file.
 * direction='derivative' records that the selected file was derived from the current file.
 */
export default class CaskfsLineageAddForm extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      direction: { type: String },
      currentPath: { type: String, attribute: 'current-path' },
      selectedSuggestion: { state: true },
      metadataText: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.direction = 'source';
    this.currentPath = '';
    this.selectedSuggestion = null;
    this.metadataText = '';

    this.ctl = {
      modal: new ModalFormController(this, {
        submitText: 'Save',
        submitCallback: '_onSubmitClick',
        openCallback: 'resetForm'
      })
    };

    this._injectModel('AppStateModel', 'LineageModel');
  }

  /**
   * @description Reset form state and set the modal title based on direction. Called by
   * ModalFormController when the modal is (re-)opened.
   */
  resetForm(){
    this.selectedSuggestion = null;
    this.metadataText = '';
    this.ctl.modal.setModalTitle(this.direction === 'derivative' ? 'Add Derivative File' : 'Add Source File');
  }

  _onTypeaheadSelect(e){
    const suggestion = e.detail.suggestion;
    if ( suggestion.isDirectory ) return;
    this.selectedSuggestion = suggestion;
  }

  _onMetadataInput(e){
    this.metadataText = e.target.value;
  }

  _onSubmit(e){
    e.preventDefault();
    if ( this.ctl.modal.modal ){
      this.ctl.modal.submit();
    } else {
      this._onSubmitClick();
    }
  }

  async _onSubmitClick(){
    const otherPath = this.selectedSuggestion?.metadata?.filepath;
    if ( !otherPath ) {
      this.AppStateModel.showToast({text: 'Please select a file', type: 'error'});
      return { payload: { error: { response: { status: 422 } } } };
    }

    const opts = { metadata: this.metadataText.trim() || undefined };

    const r = this.direction === 'derivative'
      ? await this.LineageModel.addLink(otherPath, this.currentPath, opts)
      : await this.LineageModel.addLink(this.currentPath, otherPath, opts);

    if ( r.state === 'loaded' ) {
      this.AppStateModel.showToast({text: 'Lineage link added', type: 'success'});
      this.AppStateModel.refresh();
    }

    return r;
  }

}

customElements.define('caskfs-lineage-add-form', CaskfsLineageAddForm);
