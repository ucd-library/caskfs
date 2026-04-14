import { LitElement } from 'lit';
import { render, styles } from './caskfs-upload-button.tpl.js';

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from '@ucd-lib/theme-elements/utils/mixins/main-dom-element.js';

import DropdownController from '../../controllers/DropdownController.js';
import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import uploadUtils from '../../utils/uploadUtils.js';

export default class CaskfsUploadButton extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.ctl = {
      dropdown: new DropdownController(this, { openCustomStyles: { width: 'auto', minWidth: '10rem' } }),
      directoryPath: new DirectoryPathController(this)
    };

    this._injectModel('FsModel');
  }

  /**
   * @description Toggle the upload dropdown open/closed.
   */
  _onButtonClick() {
    this.ctl.dropdown.open = !this.ctl.dropdown.open;
  }

  /**
   * @description Open the hidden file input for selecting individual files.
   */
  _onChooseFilesClick() {
    this.renderRoot.querySelector('.input-files').click();
  }

  /**
   * @description Open the hidden file input for selecting a directory.
   */
  _onChooseFolderClick() {
    this.renderRoot.querySelector('.input-folder').click();
  }

  /**
   * @description Handle file selection from either input. Delegates transformation to
   * uploadUtils.getFilesFromInput() and passes the result to FsModel.upload().
   * @param {Event} e - The change event from the file input
   */
  _onFileInputChange(e) {
    const items = uploadUtils.getFilesFromInput(e.target);
    if ( !items.length ) return;

    this.FsModel.upload(items, this.ctl.directoryPath.pathname);

    // reset so the same selection can be re-uploaded if needed
    e.target.value = '';
    this.ctl.dropdown.open = false;
  }

}

customElements.define('caskfs-upload-button', CaskfsUploadButton);
