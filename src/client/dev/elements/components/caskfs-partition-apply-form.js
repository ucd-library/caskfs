import { LitElement } from 'lit';
import {render, styles} from "./caskfs-partition-apply-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import QueryStringController from '../../controllers/QueryStringController.js';
import ModalFormController from '../../controllers/ModalFormController.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

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
      modal: new ModalFormController(this, {
        title: 'Apply/Remove Partitions', 
        submitText: 'Apply', 
        submitCallback: '_onSubmitClick', 
        openCallback: 'resetForm' 
      })
    };

    this.resetForm();

    this._injectModel('AppStateModel');
  }

  resetForm(){
    this.ctl.qs.syncState();
    if ( !this.ctl.qs.query.partition.length ) {
      this.ctl.qs.setParam('partition', '');
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
    this.ctl.qs.deleteParam('page');
    this.ctl.qs.setLocation();
  }

  _onAutoPathClick(){

    if ( this.ctl.modal.modal ){
      this.ctl.modal.closeModal();
    }
    this.AppStateModel.setLocation(appUrlUtils.fullPath('config/partitions'));
    
  }

}

customElements.define('caskfs-partition-apply-form', CaskfsPartitionApplyForm);