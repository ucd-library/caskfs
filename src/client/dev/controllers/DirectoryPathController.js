import { Registry, getLogger } from '@ucd-lib/cork-app-utils';
import AppComponentController from './AppComponentController.js';
import appPathUtils from '../utils/appPathUtils.js';

export default class DirectoryPathController {

  constructor(host){
    this.host = host;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');
    this.appComponentController = new AppComponentController(host);
    this.logger = getLogger('DirectoryPathController');

    this.pathPrefix = {
      'directory': appPathUtils.fullPath('directory', {returnArray: true}),
      'file': appPathUtils.fullPath('file', {returnArray: true}),
      'rel': appPathUtils.fullPath('rel', {returnArray: true})
    };

    this.path = [];
    this.breadcrumbs = [];

    this.updateComplete = Promise.resolve();
  }

  get pathname() {
    const path = this.path.slice(1).join('/') || '';
    return '/' + path;
  }

  get breadcrumbParent(){
    if ( this.breadcrumbs.length <= 1 ) return null;
    return this.breadcrumbs[this.breadcrumbs.length - 2];
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

  /**
   * @description Go to the file location
   * @param {String|Array} path - optional path to set. If not provided, will use current path
   */
  setFileLocation(path){
    this._setLocation(path, 'file');
  }

  /**
   * @description Go to app state location with rel prefix
   * @param {String|Array} path - optional path to set. If not provided, will use current path
   * @param {String} prefixKey - prefix key to use from this.pathPrefix
   */
  _setLocation(path, prefixKey){
    if ( typeof path === 'string' ) {
      path = path.split('/').filter(Boolean);
    }
    if ( !path ){
      path = this.path.slice(1);
    }
    const newPath = '/' + [ ...this.pathPrefix[prefixKey], ...path ].join('/');
    this.AppStateModel.setLocation(newPath);
  }

  setLocation(path){
    if ( Array.isArray(path) ) {
      this.path = path;
    } else if ( typeof path === 'string' ) {
      this.path = ['/', ...path.split('/').filter(Boolean)];
    } 
    const currentLocation = this.AppStateModel.store.data.location;
    const newPath = "/" + [ ...this.pathPrefix.directory, ...this.path.slice(1) ].filter(Boolean).join('/');
    const queryString = (new URLSearchParams(currentLocation.query)).toString();
    const url = newPath + (queryString ? '?'+queryString : '');
    this.AppStateModel.setLocation(url);
  }

  /**
   * @description Check if the AppStateModel path matches the path managed by this controller
   * @param {Array} path - optional path to compare against. If not provided, will use current AppStateModel path
   * @returns {boolean}
   */
  isAppStatePathEqual(path){
    if ( !path ) path = this.AppStateModel.store.data.location.path;
    const pathStartIndex = (this.getMatchingPathPrefix(path) || []).length;
    const appStatePath = ['/', ...path.slice(pathStartIndex).filter(Boolean)];
    if ( appStatePath.length !== this.path.length ) return false;
    for ( let i = 0; i < appStatePath.length; i++ ) {
      if ( appStatePath[i] !== this.path[i] ) return false;
    }
    return true;
  }

  async _onAppStateUpdate(e) {

    let resolveUpdateComplete;
    const deferred = new Promise(res => { resolveUpdateComplete = res; });
    this.updateComplete = Promise.all([Promise.resolve(), deferred]).then(() => undefined);

    try {
      if ( !this.appComponentController.isOnActivePage ) {
        return;
      }


      const pathStartIndex = (this.getMatchingPathPrefix(e.location.path) || []).length;
      this.path = ['/', ...e.location.path.slice(pathStartIndex).filter(Boolean)];
      this.breadcrumbs = this.path.map((part, index) => ({
        name: part === '/' ? 'root' : part,
        url: '/' + [ ...this.pathPrefix.directory, ...this.path.slice(1, index + 1) ].join('/'),
        currentPage: index === this.path.length - 1
      }));

      this.host.requestUpdate();

    } finally {
      resolveUpdateComplete?.();
    }
  }

  getMatchingPathPrefix(path, returnKey){
    if ( !path ) path = this.AppStateModel.store.data.location.path;
    for ( const [key, value] of Object.entries(this.pathPrefix) ) {
      for ( let i = 0; i < value.length; i++ ) {
        if ( path[i] !== value[i] ) break;
        if ( i === value.length - 1 ) {
          return returnKey ? key : value;
        }
      }
    }
    this.logger.warn('No matching path prefix found', path);
    return null;
  }

  hostConnected() {
    this.AppStateModel.EventBus.on('app-state-update', this._onAppStateUpdate.bind(this));
  }

  hostDisconnected() {
    this.AppStateModel.EventBus.off('app-state-update', this._onAppStateUpdate.bind(this));
  }
}
