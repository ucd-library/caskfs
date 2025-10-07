import { Registry } from '@ucd-lib/cork-app-utils';
import AppComponentController from './AppComponentController.js';

export default class DirectoryPathController {

  constructor(host, pathStartIndexProperty){
    this.host = host;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');
    this.appComponentController = new AppComponentController(host);

    this.pathStartIndexProperty = pathStartIndexProperty;
    this.pathStartIndex = this.host[this.pathStartIndexProperty] || 0;
    this.path = [];
    this.breadcrumbs = [];

    this.updateComplete = Promise.resolve();
  }

  get pathname() {
    const path = this.path.slice(1).join('/') || '';
    return '/' + path;
  }

  /**
   * @description Move up one level in the directory path. Sets app state location.
   * @returns 
   */
  moveUp(){
    if ( this.path.length <= 1 ) return;
    this.path.pop();
    this.setLocation();
  }

  setLocation(path){
    if ( Array.isArray(path) ) {
      this.path = path;
    } else if ( typeof path === 'string' ) {
      this.path = ['/', ...path.split('/').filter(Boolean)];
    } 
    const currentLocation = this.AppStateModel.store.data.location;
    const newPath = "/" + [ currentLocation.path.slice(0, this.pathStartIndex), ...this.path.slice(1) ].filter(Boolean).join('/');
    const queryString = (new URLSearchParams(currentLocation.query)).toString();
    const url = newPath + (queryString ? '?'+queryString : '');
    this.AppStateModel.setLocation(url);
  }

  async _onAppStateUpdate(e) {

    let resolveUpdateComplete;
    const deferred = new Promise(res => { resolveUpdateComplete = res; });
    this.updateComplete = Promise.all([Promise.resolve(), deferred]).then(() => undefined);

    try {
      if ( !this.appComponentController.isOnActivePage ) {
        return;
      }

      this.path = ['/', ...e.location.path.slice(this.pathStartIndex).filter(Boolean)];
      this.breadcrumbs = this.path.map((part, index) => ({
        name: part === '/' ? 'root' : part,
        url: '/' + [ e.location.path.slice(0, this.pathStartIndex), ...this.path.slice(1, index + 1) ].join('/'),
        currentPage: index === this.path.length - 1
      }));

      this.host.requestUpdate();

    } finally {
      resolveUpdateComplete?.();
    }
  }

  hostUpdate(){
    if ( this.pathStartIndex !== (this.host[this.pathStartIndexProperty] || 0) ) {
      this.pathStartIndex = this.host[this.pathStartIndexProperty] || 0;
    }
  }

  hostConnected() {
    this.AppStateModel.EventBus.on('app-state-update', this._onAppStateUpdate.bind(this));
  }

  hostDisconnected() {
    this.AppStateModel.EventBus.off('app-state-update', this._onAppStateUpdate.bind(this));
  }
}
