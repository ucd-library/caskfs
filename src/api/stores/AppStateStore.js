import {AppStateStore} from '@ucd-lib/cork-app-state';

class AppStateStoreImpl extends AppStateStore {
  constructor(){
    super();

    this.events.APP_LOADING_UPDATE = 'app-loading-update';
    this.events.APP_ERROR_UPDATE = 'app-error-update';
    this.events.APP_DIALOG_OPEN = 'app-dialog-open';
    this.events.APP_DIALOG_ACTION = 'app-dialog-action';
    this.events.APP_DIALOG_CLOSE = 'app-dialog-close';
    this.events.APP_DIALOG_UPDATE_REQUEST = 'app-dialog-update-request';
    this.events.APP_TOAST_SHOW = 'app-toast-show';
  }
}

const store = new AppStateStoreImpl();
export default store;
