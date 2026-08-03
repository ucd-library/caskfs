import { LitElement } from 'lit';
import {render, styles} from "./caskfs-partition-edit-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import ModalFormController from '../../controllers/ModalFormController.js';

/**
 * @class CaskfsPartitionEditForm
 * @description Modal form for editing a single file's manually-assigned partition keys.
 * Auto-path-derived keys are displayed read-only and are recomputed server-side; they
 * cannot be edited here. Partition detail is only fetched when the modal is opened.
 */
export default class CaskfsPartitionEditForm extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      filePath: { type: String, attribute: 'file-path' },
      manualPartitions: { state: true },
      autoPartitions: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.filePath = '';
    this.manualPartitions = [''];
    this.autoPartitions = [];

    this.ctl = {
      modal: new ModalFormController(this, {
        title: 'Edit Partitions',
        submitText: 'Save',
        submitCallback: '_onSubmitClick',
        openCallback: 'loadPartitionDetail'
      })
    };

    this._injectModel('AppStateModel', 'FsModel');
  }

  willUpdate(changedProps){
    // Covers the modal's very first open: the ModalFormController's openCallback is wired
    // up in hostConnected(), which runs after this element is created with filePath already
    // set, i.e. after the 'app-dialog-open' event that triggered its creation already fired.
    // willUpdate() reacts to the filePath property itself, so it still fires on that first
    // render. openCallback remains for re-opening the modal with the same filePath, where
    // Lit's default change-detection wouldn't otherwise trigger a re-fetch.
    if ( changedProps.has('filePath') ) {
      this.loadPartitionDetail();
    }
  }

  /**
   * @description Fetch the current partition key detail for filePath. Called on filePath
   * change and by ModalFormController when the modal is (re-)opened.
   */
  async loadPartitionDetail(){
    this.autoPartitions = [];
    this.manualPartitions = [''];

    if ( !this.filePath ) return;

    const res = await this.FsModel.getPartitionKeyDetail(this.filePath);
    if ( res.state === 'loaded' ) {
      this.autoPartitions = res.payload.auto || [];
      this.manualPartitions = res.payload.manual?.length ? [...res.payload.manual] : [''];
    }
  }

  _onPartitionInput(i, value){
    this.manualPartitions = this.manualPartitions.map((p, idx) => idx === i ? value : p);
  }

  _onAddPartitionClick(){
    this.manualPartitions = [...this.manualPartitions, ''];
  }

  _onRemovePartitionClick(i){
    if ( this.manualPartitions.length > 1 ) {
      this.manualPartitions = this.manualPartitions.filter((_, idx) => idx !== i);
    } else {
      this.manualPartitions = [''];
    }
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
    const partitionKeys = this.manualPartitions.map(p => p.trim()).filter(Boolean);
    const r = await this.FsModel.patchPartitionKeys(this.filePath, partitionKeys);
    if ( r.state === 'loaded' ) {
      this.AppStateModel.showToast({text: 'Partitions updated', type: 'success'});
      this.AppStateModel.refresh();
    }
    return r;
  }

}

customElements.define('caskfs-partition-edit-form', CaskfsPartitionEditForm);
