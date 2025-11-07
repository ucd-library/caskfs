import {AppStateModel} from '@ucd-lib/cork-app-state';
import AppStateStore from '../stores/AppStateStore.js';
import config from '../../client/dev/config.js';
import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';

class AppStateModelImpl extends AppStateModel {

  constructor() {
    super();
    this.store = AppStateStore;

    let routes = config.routes;
    if ( appUrlUtils.basePath ){
      routes = routes.map(r => appUrlUtils.fullPath(r, { noLeadingSlash: true }));
    }
    this.init(routes, { homeRoute: appUrlUtils.fullPath() });

    this.loadingRequests = [];
    this._loaderVisible = false;
    this._hideLoaderTimer = null;


    this.errorRequests = [];
    this._errorVisible = false;
    this._showErrorTimer = null;
  }

  set(update) {
    if( update.location ) {
      update.lastPage = this.store.data.page;
      update.lastLocation = JSON.parse(JSON.stringify(this.store.data.location));
      const relativePath = appUrlUtils.relativePath(update.location.pathname, { returnArray: true });
      let page = relativePath?.[0] ? relativePath[0] : 'home';

      if ( page === 'config' && relativePath?.[1] ) {
        page = relativePath[1];
      } 

      update.page = page;
    }

    return super.set(update);
  }

  /**
   * @description Add a request to the loading queue. Typically called from BaseStore when a store enters the loading state.
   * Controls loader visibility
   * @param {Object} req - A wrapper object with the following properties:
   * @param {Object} req.payload - The cork-app-utils payload of the request
   * @param {Object} req.loaderSettings - The loader settings object from the store that initiated the loading state
   */
  addLoadingRequest(req) {
    if ( req.loaderSettings?.suppressLoader ) return;
    this.loadingRequests.push(req);

    if (this._hideLoaderTimer) {
      clearTimeout(this._hideLoaderTimer);
      this._hideLoaderTimer = null;
    }

    if (!this._loaderVisible) {
      this.showLoading();
    }
  }

  /**
   * @description Remove a request from the loading queue. Typically called from BaseStore when a store enters the loaded state.
   * Controls loader visibility
   * @param {Object} req - A wrapper object with the following properties:
   * @param {Object} req.payload - The cork-app-utils payload of the request
   * @param {Object} req.loaderSettings - The loader settings object from the store that initiated the loading state
   */
  removeLoadingRequest(req) {
    if ( req.loaderSettings?.suppressLoader ) return;
    this.loadingRequests = this.loadingRequests.filter(r => r.payload.id !== req.payload.id);

    if (this.loadingRequests.length === 0 && !this._hideLoaderTimer) {

      this._hideLoaderTimer = setTimeout(() => {
        this._hideLoaderTimer = null;
        if (this.loadingRequests.length === 0) {

          this.hideLoading();
        }
      }, 100);
    }
  }

  /**
   * @description Add an error request to the error queue. Typically called from BaseStore when a store enters the error state.
   * Controls error dialog visibility
   * @param {Object} req - A wrapper object with the following properties:
   * @param {Object} req.payload - The cork-app-utils payload of the request
   * @param {Object} req.errorSettings - The error settings object from the store that caused the error
   * @returns
   */
  addErrorRequest(req) {
    this.errorRequests.push(req);
    if ( this._errorVisible || this._showErrorTimer ) return;

    this._showErrorTimer = setTimeout(() => {
      this._showErrorTimer = null;
      const fullPageErrors = this.errorRequests.filter(r => !r.errorSettings?.showToast);
      const toastErrors = this.errorRequests.filter(r => r.errorSettings?.showToast);
      this.errorRequests = [];
      if ( fullPageErrors.length ){
        this.showError({requests: fullPageErrors});
      }
      toastErrors.forEach(r => {
        let message = r.errorSettings?.message || 'An error occurred';
        this.showToast({text: message, type: 'error'});
      });
    }, 100);

  }

  refresh(){
    const state = this.store.data;
    this.set(state);
    this.store.emit(this.store.events.APP_STATE_UPDATE, state);
  }

  showLoading(){
    this._loaderVisible = true;
    this.store.emit(this.store.events.APP_LOADING_UPDATE, {show: true});
  }

  hideLoading(){
    this._loaderVisible = false;
    this.store.emit(this.store.events.APP_LOADING_UPDATE, {show: false});
    if ( this.toastOnPageLoad ) {
      this.showToast(this.toastOnPageLoad);
      this.toastOnPageLoad = null;
    }
  }

  /**
   * @description show an error message
   * @param {Object} opts - error message options
   * @param {String} opts.requests - array of cork-app-utils request objects that caused the error
   * @param {String} opts.message - A single error message if only one error. Optional.
   */
  showError(opts){
    this._errorVisible = true;
    this.store.emit(this.store.events.APP_ERROR_UPDATE, {show: true, opts});
    this.closeDialogModal();
  }

  hideError(){
    this._errorVisible = false;
    this.store.emit(this.store.events.APP_ERROR_UPDATE, {show: false});
  }

  /**
   * @description Show a modal dialog box.
   * To listen for the action event, add the _onAppDialogAction method to your element and then filter on e.action.value
   * @param {Object} options Dialog object with the following properties:
   * - title {TemplateResult} - The title of the dialog (optional)
   * - content {TemplateResult} - The html content of the dialog (optional, but should probably be included)
   * - actions {Array} - Array of objects with the following properties:
   *  - text {String} - The text of the button
   *  - value {String} - The action slug that is emitted when button is clicked
   *  - invert {Boolean} - Invert the button color (optional)
   *  - color {String} - The brand color string of the button (optional)
   *  - disableOnLoading {Boolean} - Disable the button when the modal is in a loading state (optional)
   * - data {Object} - Any data to pass along in the action event (optional)
   * - actionCallback {Function} - A callback function to run when the action is clicked (optional).
   *     The function will be passed the action object and the modal element instance.
   *     The function should return an object with an abortModalAction property set to true to prevent the modal from closing.
   * - reloadLast {Boolean} - If true, will reload the last dialog content, title, actions, and data instead of using the passed in options (optional)
   *
   * If the actions array is empty, a 'Dismiss' button will be added automatically
   */
  showDialogModal(options={}){
    if ( !options.actions ) {
      options.actions = [{text: 'Cancel', value: 'dismiss', invert: true, color: 'secondary'}];
    }
    if ( !options.data ) {
      options.data = {};
    }
    if ( !options.title ) {
      options.title = '';
    }
    if ( !options.content ) {
      options.content = '';
    }
    console.log('showDialogModal', options);
    this.store.emit('app-dialog-open', options);
  }

  closeDialogModal(opts={}){
    this.store.emit('app-dialog-close', opts);
  }

  requestDialogUpdate(){
    this.store.emit('app-dialog-update-request');
  }

  /**
   * @description Show a toast message
   * @param {Object} opts - toast options
   * @param {String} opts.text - The text of the toast
   * @param {String} opts.type - Optional. The type of toast. Options are 'basic' 'success', 'error'
   * @param {Number} opts.displayTime - Optional. The time in ms to display the toast.
   * @param {Number} opts.animationTime - Optional. The time in ms to do enter/exit animations
   * @param {Boolean} opts.showOnPageLoad - Optional. Wait to show the toast on the next page load event
   */
  showToast(opts={}){
    if ( opts.showOnPageLoad ) {
      delete opts.showOnPageLoad;
      this.toastOnPageLoad = opts;
      return;
    }
    this.store.emit(this.store.events.APP_TOAST_SHOW, opts);
  }

}

const model = new AppStateModelImpl();
export default model;
