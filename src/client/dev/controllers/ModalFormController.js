import { Registry } from '@ucd-lib/cork-app-utils';

/**
 * @description Controller for managing modal behavior from a form-based custom element.
 * e.g. automatically wires up submit button, loading state, title, etc.
 * @param {LitElement} host The host element the controller is attached to
 * @param {Object} opts Options for configuring the modal behavior
 * @param {String} opts.title The default title for the modal. Can be overridden by calling setModalTitle
 * @param {String} opts.submitText The text for the submit button. Default is 'Submit'. Can be overridden by calling setModalSubmitButton
 * @param {String} opts.submitActionId The action id for the submit button. Default is '<host-tag-name>-SUBMIT'. Can be overridden by calling setModalSubmitButton
 * @param {Function|String} opts.submitCallback The callback to call when the submit button is clicked. 
  *   If a string is provided, it will be treated as the name of a method on the host element.
 * @param {Boolean} opts.noCloseOnSubmit If true, the modal will not close automatically after submit is called. Default is false.
 * @param {Function|String} opts.openCallback The callback to call when the modal is opened.
 */
export default class ModalFormController {

  constructor(host, opts={}) {
    this.host = host;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');

    this._modal = null;
    this.title = opts.title || '';
    this.submitText = opts.submitText || 'Submit';
    this.submitActionId = opts.submitActionId || this.host.tagName + '-SUBMIT';
    this.submitCallback = opts.submitCallback;
    this.noCloseOnSubmit = opts.noCloseOnSubmit || false;
    this.openCallback = opts.openCallback;
  }

  /**
   * @description Get the modal parent of the host element, if it exists
   * @returns {CorkAppDialogModal|null} The modal element or null if not found
   */
  get modal(){
    if ( this._modal) return this._modal;

    let el = this.host;
    while( el ) {
      if ( el.tagName === 'CORK-APP-DIALOG-MODAL' ){
        this._modal = el;
        return el;
      }
      if ( el.parentElement ){
        el = el.parentElement;
      } else if ( el.parentNode?.host ) {
        el = el.parentNode.host;
      } else {
        return null;
      }
    }
    return null;
  }

  /**
   * @description Set the modal to its default values declared in the controller options
   */
  setDefaultModalValues(){
    if ( !this.modal ) return;
    this.setModalTitle();
    this.setModalSubmitButton();
  }

  /**
   * @description Set the modal title
   * @param {String} title - The title to set. 
   */
  setModalTitle(title){
    if ( !this.modal ) return;
    if ( title ) {
      this.title = title;
    }
    this.modal.modalTitle = this.title;
  }

  /**
   * @description Set the modal submit button
   * @param {String} text - The text to display on the submit button.
   * @returns 
   */
  setModalSubmitButton(text){
    if ( !this.modal ) return;
    if ( text ) {
      this.submitText = text;
    }
    this.modal.actions = [
      ...this.modal.actions.filter(a => a.value !== this.submitActionId),
      {
        text: this.submitText,
        value: this.submitActionId,
        disableOnLoading: true,
        disableClose: true
      }
    ];
  }

  closeModal(){
    if ( this.modal ) this.modal.close();
  }

  async submit(){
    return this._onAppDialogAction({action: {value: this.submitActionId}});
  }

  /**
   * @description Callback for when a modal action event occurs
   * @param {Object} e - The event object
   * @returns 
   */
  async _onAppDialogAction(e){
    if ( !this.modal || e.action.value !== this.submitActionId ) return;
    if ( !this.submitCallback ) {
      this.modal.close();
      return;
    }
    this.modal.loading = true;
    let r;
    if ( typeof this.submitCallback === 'string' ){
      r = await this.host[this.submitCallback]();
    } else {
      r = await this.submitCallback(this.host);
    }
    this.modal.loading = false;
    if ( this.noCloseOnSubmit ) return;

    // only close the modal if no validation errors
    r = (Array.isArray(r) ? r : [r]).filter(req => req);
    if ( !r.find(req => req?.payload?.error?.response?.status == 422) ) {
      this.modal.close();
    }
  }

  /**
   * @description Callback for when the app modal is opened
   */
  async _onAppDialogOpen(){
    let modal = this.modal;
    if ( !modal ) return;

    // there can be a race condition where previous modal form hasnt fully closed yet
    // wait for update, and bail if host has been disconnected from modal
    modal.requestUpdate();
    await modal.updateComplete;
    if ( !this.modal ) return;

    this.setDefaultModalValues();
    if ( typeof this.openCallback === 'string' ) {
      this.host[this.openCallback]();
    } else if ( typeof this.openCallback === 'function' ) {
      this.openCallback(this.host);
    }
    this.host.requestUpdate();
  }

  hostConnected() {
    this.AppStateModel.EventBus.on('app-dialog-action', this._onAppDialogAction.bind(this));
    this.AppStateModel.EventBus.on('app-dialog-open', this._onAppDialogOpen.bind(this));
    this.setDefaultModalValues();
  }

  hostDisconnected() {
    this.AppStateModel.EventBus.off('app-dialog-action', this._onAppDialogAction.bind(this));
    this.AppStateModel.EventBus.off('app-dialog-open', this._onAppDialogOpen.bind(this));
    this._modal = null;
  }

}


