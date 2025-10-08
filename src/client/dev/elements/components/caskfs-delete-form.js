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
      isSingleFile: { state: true },
      isSingleDirectory: { state: true }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.modalCtl = new ModalFormController(this, {title: 'Confirm Deletion', submitText: 'Delete', submitCallback: '_onSubmitClick'});

    this.items = [];
    this.reqOptions = {};

    this._injectModel('AppStateModel', 'DirectoryModel');
  }

  willUpdate(props){
    if ( props.has('items') ) {
      if ( !this.items ) this.items = [];
      if ( !Array.isArray(this.items) ) this.items = [this.items];
      if ( this.items.length === 1 ) {
        this.isSingleFile = !!this.items[0]?.file_id;
        this.isSingleDirectory = !this.items[0]?.file_id;
      }
      this.reqOptions = {};
    }
  }

  _onSubmit(e){
    e.preventDefault();
    if ( this.modalCtl.modal ){
      this.modalCtl.submit();
    } else {
      this._onSubmitClick();
    }
  }

  async submit(){
    let r;
    if ( this.isSingleFile ){
      r = await this.DirectoryModel.deleteFile(this.items[0].filepath, this.reqOptions);
    }

    return r;
  }

  async _onSubmitClick(){
    if ( !this.isSingleFile ){
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
      this.AppStateModel.refresh();
    }

    return r;
  }

  _onInput(prop, val) {
    this.reqOptions[prop] = val;
    this.requestUpdate();
  }

}

customElements.define('caskfs-delete-form', CaskfsDeleteForm);