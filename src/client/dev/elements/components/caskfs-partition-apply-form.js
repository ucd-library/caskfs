import { LitElement } from 'lit';
import {render, styles} from "./caskfs-partition-apply-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import ModalFormController from '../../controllers/ModalFormController.js';

export default class CaskfsPartitionApplyForm extends Mixin(LitElement)
  .with(LitCorkUtils) {

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
      qs: new QueryStringController(this, { types: { partition: 'array' } }),
      modal: new ModalFormController(this, {title: 'Apply/Remove Partitions', submitText: 'Apply', submitCallback: '_onSubmitClick'})
    };
  }

  _onSubmit(e){
    e.preventDefault();
    if ( this.modalCtl.modal ){
      this.modalCtl.submit();
    } else {
      this._onSubmitClick();
    }
  }

  apply(){
    this.ctl.qs.setLocation();
  }

  async _onSubmitClick(){}

}

customElements.define('caskfs-partition-apply-form', CaskfsPartitionApplyForm);