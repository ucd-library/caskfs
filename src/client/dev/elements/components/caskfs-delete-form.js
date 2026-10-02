import { LitElement } from 'lit';
import {render} from "./caskfs-delete-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import ModalFormController from '../../controllers/ModalFormController.js';

export default class CaskfsDeleteForm extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      items: { },
      reqOptions: { type: Object },
      successLocation: { type: String, attribute: 'success-location' },
      isSingleFile: { state: true },
      isSingleDirectory: { state: true },
      deleteProgress: { state: true }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);
    
    this.ctl = {
      modal: new ModalFormController(this, {title: 'Confirm Deletion', submitText: 'Delete', submitCallback: '_onSubmitClick'})
    };
    
    this.successLocation = '';

    this.items = [];
    this.reqOptions = {};
    this.deleteProgress = null;
    this._isDeleting = false;

    this._injectModel('AppStateModel', 'DirectoryModel', 'FsModel');
  }

  willUpdate(props){
    // the dialog re-binds .items on every re-render of its (unrelated) parent content
    // (e.g. cork-app-dialog-modal's own layout-driven re-renders, or a background
    // AppStateModel.refresh()); skip resetting state from that while a delete streams in,
    // or the in-progress deleteProgress gets wiped before it's ever visible
    if ( props.has('items') && !this._isDeleting ) {
      this.updateState();
    }
  }

  _onAppDialogOpen(){
    if ( this.ctl.modal.modal ){
      this.updateState();
    }
  }

  updateState(){
    if ( !this.items ) this.items = [];
    if ( !Array.isArray(this.items) ) this.items = [this.items];
    if ( this.items.length === 1 ) {
      this.isSingleFile = !!this.items[0]?.filepath;
      this.isSingleDirectory = !this.items[0]?.filepath;
    } else {
      this.isSingleFile = false;
      this.isSingleDirectory = false;
    }
    this.reqOptions = {};
    this.deleteProgress = null;
  }

  _onSubmit(e){
    e.preventDefault();
    if ( this.ctl.modal.modal ){
      this.ctl.modal.submit();
    } else {
      this._onSubmitClick();
    }
  }

  async submit(){
    this._isDeleting = true;
    try {
      let r;
      if ( this.isSingleFile ) {
        r = await this.FsModel.delete(this.items[0].filepath, this.reqOptions);
      } else if ( this.isSingleDirectory ){
        this.reqOptions.directory = true;
        this.deleteProgress = { deletedCount: 0 };
        r = await this.FsModel.delete(this.items[0].fullname, this.reqOptions);
      }
      console.log('delete result', r);
      return r;
    } finally {
      this._isDeleting = false;
    }
  }

  /**
   * @description Bound to FsStore fs-delete-progress-update event. Updates the running
   * count/last-deleted-path shown while a directory delete is in progress. Total scope isn't
   * known ahead of time, so this can only show progress made so far, not a percentage.
   * @param {Object} e - store entry from FsService.deleteStream ({deletedCount, lastDeletedFile, ...})
   */
  _onFsDeleteProgressUpdate(e){
    if ( !this.deleteProgress ) return;
    this.deleteProgress = { deletedCount: e.deletedCount, lastDeletedFile: e.lastDeletedFile };
  }

  async _onSubmitClick(){
    if ( !this.isSingleFile && !this.isSingleDirectory ) {
      console.warn('Bulk delete not implemented yet');
      return;
    }
    
    const r = await this.submit();
    if ( r?.payload?.error?.response?.status == 422 ){
      let text = 'Deletion Failed. Please fix the form errors and try again.';
      this.AppStateModel.showToast({text, type: 'error'});
      return r;
    }

    if ( r.state === 'loaded' ){
      let text = 'Items deleted successfully.';
      if ( this.isSingleFile ) {
        text = `File deleted successfully.`;
      } else if ( this.isSingleDirectory ) {
        text = `Directory deleted successfully.`;
      }
      this.AppStateModel.showToast({text, type: 'success', showOnPageLoad: true});
      if ( this.successLocation ) {
        this.AppStateModel.setLocation(this.successLocation);
      } else {
        this.AppStateModel.refresh({ scrollToLastPosition: true });
      }
    }

    return r;
  }

  _onInput(prop, val) {
    this.reqOptions[prop] = val;
    this.requestUpdate();
  }

}

customElements.define('caskfs-delete-form', CaskfsDeleteForm);