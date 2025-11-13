import { Registry } from '@ucd-lib/cork-app-utils';
import AppComponentController from './AppComponentController.js';

/**
 * @description Controller for managing query string parameters in the URL.
 */
export default class QueryStringController {

  constructor(host, opts={}){
    this.types = opts.types || {};
    this.pageSize = opts.pageSize || 20;
    this.alwaysSyncOnAppStateUpdate = opts.alwaysSyncOnAppStateUpdate || false;
    this.host = host;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');
    this.appComponentController = new AppComponentController(host);
    this.syncState();

    this.updateComplete = Promise.resolve();
  }

  /**
   * @description Set a query string parameter
   * @param {String} key - the query string parameter key
   * @param {*} value - the query string parameter value
   * @param {Object} opts - options for setting the parameter
   * @param {Number} opts.position - position to insert value at (for array types)
   * @param {Boolean} opts.append - whether to append value to array (for array types)
   * @param {Boolean} opts.increasePosition - whether to move value up one position in array (for array types)
   * @param {Boolean} opts.decreasePosition - whether to move value down one position in array (for array types)
   * @param {Boolean} opts.update - whether to update existing value at position (for array types)
   */
  setParam(key, value, opts={}){

    // array param
    if ( this.types[key] === 'array' && !Array.isArray(value) ) {
      
      if ( opts.position !== undefined ) {
        if ( opts.update ) {
          this.query[key][opts.position] = value;
        } else {
          this.query[key].splice(opts.position, 0, value);
        }
      } else if ( opts.append ) {
        this.query[key].push(value);
      } else if ( opts.increasePosition ) {
        const index = this.query[key].indexOf(value);
        if ( index > 0 ) {
          this.query[key].splice(index, 1);
          this.query[key].splice(index - 1, 0, value);
        }
      } else if ( opts.decreasePosition ) {
        const index = this.query[key].indexOf(value);
        if ( index > -1 && index < this.query[key].length - 1 ) {
          this.query[key].splice(index, 1);
          this.query[key].splice(index + 1, 0, value);
        }
      } else {
        this.query[key] = [value];
      }
    
    // string param
    } else {
      this.query[key] = value;
    }

    
    this.host.requestUpdate();
  }

  /**
   * @description Delete a query string parameter
   * @param {String} key - the query string parameter key
   */
  deleteParam(key, opts={}){
    if ( this.types[key] === 'array' ) {
      if ( opts.position !== undefined ) {
        this.query[key].splice(opts.position, 1);
      } else {
        this.query[key] = [];
      }
    } else {
      delete this.query[key];
    }
    this.host.requestUpdate();
  }

  /**
   * @description Get the current page offset based on page size and page number
   * @returns {Number} - the page offset
   */
  get pageOffset(){
    const page = this.query.page || 1;
    return (page - 1) * this.pageSize;
  }

  /**
   * @description Calculate the maximum number of pages based on total items and page size
   * @param {Number} totalItems - the total number of items
   * @returns {Number} - the maximum number of pages
   */
  maxPages(totalItems){
    if ( Array.isArray(totalItems) ) {
      totalItems = totalItems.length;
    }
    return Math.ceil(totalItems / this.pageSize);
  }

  /**
   * @description Paginate data based on current page and page size
   * @param {Array} data - the data to paginate
   * @returns {Array} - Array with only the items for the current page
   */
  paginateData(data){
    const page = this.query.page || 1;
    const start = (page - 1) * this.pageSize;
    const end = start + this.pageSize;
    return data.slice(start, end);
  }

  /**
   * @description Add a sort field to internal sort state
   * @param {String} field - The field to sort by
   * @param {Boolean} isDesc - Whether to sort in descending order
   */
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

  /**
   * @description Remove a sort field from internal sort state
   * @param {String} field - The field to remove from sorting
   */
  removeSortField(field){
    const sort = this.sort.filter(s => s.field !== field);
    this.sort = sort;
  }

  /**
   * @description Multi-sort data based on internal sort state
   * @param {Array} data - Data to sort
   * @returns {Array} - Sorted data
   */
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

  /**
   * @description Sort state from query string
   * @returns {Array} - Array of sort fields and directions
   */
  get sort(){
    return this.parseSortString(this.query.sort);
  }

  /**
   * @description Set sort state
   * @param {Array|String} value - Array of sort fields and directions or sort string
   */
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

  /**
   * @description Parse a sort string into an array of sort objects
   * @param {String} sortString - The comma-separated sort string
   * @returns {Array} - Array of sort objects
   */
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

  /**
   * @description Convert an array of sort objects into a sort string
   * @param {Array} sortArray - Objects representing sort fields and directions
   * @returns {String} - The comma-separated sort string
   */
  sortToString(sortArray=[]){
    return sortArray
      .map(s => (s.isDesc ? '-' : '+') + s.field)
      .join(',');
  }

  /**
   * @description Get the current query string parameters 
   * @param {Boolean} asObject - Whether to return the query as an object
   * @returns {Object|URLSearchParams} - The current query string parameters
   */
  getQuery(asObject){
    let q = {}
    for ( const key of Object.keys(this.query) ) {
      if ( this.types[key] === 'array' && Array.isArray(this.query[key]) ) {
        const qs = this.query[key].filter(v => v);
        if ( qs.length ) {
          q[key] = qs.join(',');
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

  /**
   * @description Update the browser location from internal controller state
   */
  setLocation(){
    const qs = this.getQuery().toString();
    this.AppStateModel.setLocation(`${this.AppStateModel.store.data.location.pathname}${qs ? '?'+qs : ''}`);
  }


  /**
   * @description Reset query to default values based on types
   */
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

  /**
   * @description Sync internal query state from application state
   * @param {Object} e - Application state event data. Defaults to current app state if not provided
   */
  syncState(e){
    if ( !e ) e = this.AppStateModel.store.data;
    const q = e?.location?.query || {};
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
      if ( !this.appComponentController.isOnActivePage && !this.alwaysSyncOnAppStateUpdate ) {
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
