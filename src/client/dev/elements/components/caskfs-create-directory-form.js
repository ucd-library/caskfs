import { LitElement } from 'lit';
import {render, styles} from "./caskfs-create-directory-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import ModalFormController from '../../controllers/ModalFormController.js';
import uploadUtils from '../../utils/uploadUtils.js';

/**
 * @description Modal form for creating a new, empty child directory under parentDirectory.
 */
export default class CaskfsCreateDirectoryForm extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      parentDirectory: { type: String, attribute: 'parent-directory' },
      name: { state: true },
      errorMessage: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.parentDirectory = '/';
    this.name = '';
    this.errorMessage = '';

    this.ctl = {
      modal: new ModalFormController(this, {
        title: 'Create Empty Folder',
        submitText: 'Create',
        submitCallback: '_onSubmitClick',
        openCallback: 'resetForm'
      })
    };

    this._injectModel('AppStateModel', 'FsModel');
  }

  /**
   * @description Reset form state. Called by ModalFormController when the modal is (re-)opened.
   */
  resetForm(){
    this.name = '';
    this.errorMessage = '';
  }

  _onNameInput(e){
    this.name = e.target.value;
    this.errorMessage = '';
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
    const name = this.name.trim();
    if ( !name ) {
      this.errorMessage = 'Folder name is required';
      return { payload: { error: { response: { status: 422 } } } };
    }
    if ( name.includes('/') ) {
      this.errorMessage = 'Folder name cannot contain "/"';
      return { payload: { error: { response: { status: 422 } } } };
    }

    const directory = uploadUtils.joinPath([this.parentDirectory, name], { leadingSlash: true });
    const r = await this.FsModel.createDirectory(directory);

    if ( r.state === 'loaded' ) {
      this.AppStateModel.showToast({text: 'Folder created successfully', type: 'success'});
      this.AppStateModel.refresh();
    }

    return r;
  }

}

customElements.define('caskfs-create-directory-form', CaskfsCreateDirectoryForm);
