import { Registry } from '@ucd-lib/cork-app-utils';
import AppComponentController from './AppComponentController.js';

export default class QueryStringController {

  constructor(host, opts={}){
    this.types = opts.types || {};
    this.pageSize = opts.pageSize || 20;
    this.host = host;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');
    this.appComponentController = new AppComponentController(host);
    this.query = {};

    this.updateComplete = Promise.resolve();
  }

  setParam(key, value){
    this.query[key] = value;
    this.host.requestUpdate();
  }

  deleteParam(key){
    delete this.query[key];
    this.host.requestUpdate();
  }

  get pageOffset(){
    const page = this.query.page || 1;
    return (page - 1) * this.pageSize;
  }

  maxPages(totalItems){
    if ( Array.isArray(totalItems) ) {
      totalItems = totalItems.length;
    }
    return Math.ceil(totalItems / this.pageSize);
  }

  paginateData(data){
    const page = this.query.page || 1;
    const start = (page - 1) * this.pageSize;
    const end = start + this.pageSize;
    return data.slice(start, end);
  }

  addSortField(field, isDesc=false){
    const sort = this.sort;
    const existing = sort.find(s => s.field === field);
    if ( existing ) {
      existing.isDesc = isDesc;
    } else {
      sort.push({ field, isDesc });
    }
    this.sort = sort;
  }

  removeSortField(field){
    const sort = this.sort.filter(s => s.field !== field);
    this.sort = sort;
  }

  multiSort(data) {
    return data.sort((a, b) => {
      for (const { field, isDesc } of this.sort) {
        const dir = isDesc ? -1 : 1;
        const av = a[field];
        const bv = b[field];

        // Handle undefined/null consistently
        if (av == null && bv == null) continue;
        if (av == null) return -1 * dir;
        if (bv == null) return 1 * dir;

        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
      }
      return 0;
    });
  }

  get sort(){
    return this.parseSortString(this.query.sort);
  }

  set sort(value){
    if ( Array.isArray(value) ) {
      this.query.sort = this.sortToString(value);
    } else if ( typeof value === 'string' ) {
      this.query.sort = value;
    } else {
      this.query.sort = '';
    }
    this.host.requestUpdate();
  }

  parseSortString(sortString=''){
    return sortString
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(part => ({
        field: part.replace(/^[-+]/, ''),
        isDesc: part.startsWith('-')
      }));
  }

  sortToString(sortArray=[]){
    return sortArray
      .map(s => (s.isDesc ? '-' : '+') + s.field)
      .join(',');
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
      } else if ( key === 'pageSize' ) {
        if ( this.query[key] && this.query[key] !== this.pageSize ) q[key] = this.query[key];
      } else if ( key === 'page' ) {
        if ( this.query[key] && this.query[key] !== 1 ) q[key] = this.query[key];
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

  syncState(e){
    if ( !e ) e = this.AppStateModel.store.data;
    const q = e.location?.query || {};
    this.resetQuery();
    for ( const key of Object.keys(q) ) {
      if ( this.types[key] === 'array' ) {
        this.query[key] = q[key] ? q[key].split(',') : [];
      } else if ( this.types[key] === 'boolean' ) {
        this.query[key] = q[key] === 'false' ? false : true;
      } else if ( key === 'pageSize' ) {
        const ps = parseInt(q[key]);
        this.query[key] = isNaN(ps) ? this.pageSize : ps;
      } else if ( key === 'page' ) {
        const p = parseInt(q[key]);
        this.query[key] = isNaN(p) ? 1 : p;
      } else {
        this.query[key] = q[key];
      }
    }
    this.host.requestUpdate();
  }

  async _onAppStateUpdate(e) {

    // create a promise that resolves when query is set
    // important if want to use query in appStateUpdate handlers elsewhere
    let resolveUpdateComplete;
    const deferred = new Promise(res => { resolveUpdateComplete = res; });
    this.updateComplete = Promise.all([Promise.resolve(), deferred]).then(() => undefined);

    // set query params based on location and default types
    try {
      if ( !this.appComponentController.isOnActivePage ) {
        return;
      }
      this.syncState(e);
    } finally {
      // signal that query is set
      resolveUpdateComplete?.();
    }
  }

  hostConnected() {
    this.AppStateModel.EventBus.on('app-state-update', this._onAppStateUpdate.bind(this));
  }

  hostDisconnected() {
    this.AppStateModel.EventBus.off('app-state-update', this._onAppStateUpdate.bind(this));
  }
}
