import { Registry } from '@ucd-lib/cork-app-utils';
import AppComponentController from './AppComponentController.js';

export default class QueryStringController {

  constructor(host, opts={}){
    this.types = opts.types || {};
    this.host = host;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');
    this.appComponentController = new AppComponentController(host);
    this.query = {};
    this.scrollTo = null;

    this.queryIsSet = Promise.resolve();
  }

  setParam(key, value){
    this.query[key] = value;
    this.host.requestUpdate();
  }

  deleteParam(key){
    delete this.query[key];
    this.host.requestUpdate();
  }

  getQuery(asObject){
    let q = {}
    for ( const key of Object.keys(this.query) ) {
      if ( this.types[key] === 'array' ) {
        if ( Array.isArray(this.query[key]) && this.query[key].length ) {
          q[key] = this.query[key].join(',');
        }
      } else if ( this.types[key] === 'boolean' ) {
        if ( this.query[key] ) q[key] = 'true';
      } else {
        if ( this.query[key] ) q[key] = this.query[key];
      }
    }
    if ( asObject ) return q;
    const qp = new URLSearchParams(q);
    return qp;
  }

  setLocation(){
    const qs = this.getQuery().toString();
    this.AppStateModel.setLocation(`${this.AppStateModel.store.data.location.pathname}${qs ? '?'+qs : ''}`);
  }


  resetQuery(){
    const q = {};
    for ( const key of Object.keys(this.types) ) {
      if ( this.types[key] === 'array' ) {
        q[key] = [];
      } else if ( this.types[key] === 'boolean' ) {
        q[key] = false;
      } else {
        q[key] = '';
      }
    }
    this.query = q;
  }

  async _onAppStateUpdate(e) {

    // create a promise that resolves when query is set
    // important if want to use query in appStateUpdate handlers elsewhere
    let resolveQueryIsSet;
    const deferred = new Promise(res => { resolveQueryIsSet = res; });
    this.queryIsSet = Promise.all([Promise.resolve(), deferred]).then(() => undefined);

    // set query params based on location and default types
    try {
      if ( !this.appComponentController.isOnActivePage ) {
        return;
      }
      const q = e.location?.query || {};
      this.resetQuery();
      for ( const key of Object.keys(q) ) {
        if ( key === 'scrollTo' ) {
          this.scrollTo = q[key];
          continue;
        }
        if ( this.types[key] === 'array' ) {
          this.query[key] = q[key] ? q[key].split(',') : [];
        } else if ( this.types[key] === 'boolean' ) {
          this.query[key] = q[key] === 'false' ? false : true;
        } else {
          this.query[key] = q[key];
        }
      }
      this.host.requestUpdate();

    } finally {
      // signal that query is set
      resolveQueryIsSet?.();
    }
  }

  hostConnected() {
    this.AppStateModel.EventBus.on('app-state-update', this._onAppStateUpdate.bind(this));
  }

  hostDisconnected() {
    this.AppStateModel.EventBus.off('app-state-update', this._onAppStateUpdate.bind(this));
  }
}
