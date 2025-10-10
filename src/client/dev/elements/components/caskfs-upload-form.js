import { LitElement } from 'lit';
import { render } from "./caskfs-upload-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import ModalFormController from '../../controllers/ModalFormController.js';

export default class CaskfsUploadForm extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.modalCtl = new ModalFormController(this, {title: 'Upload Files', submitText: 'Upload', submitCallback: '_onSubmitClick'});
  }

  async _onSubmitClick(){
    console.log('upload form submit clicked');
  }

  _onSubmit(e){
    e.preventDefault();
    if ( this.modalCtl.modal ){
      this.modalCtl.submit();
    } else {
      this._onSubmitClick();
    }
  }

}

customElements.define('caskfs-upload-form', CaskfsUploadForm);