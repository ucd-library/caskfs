import {v4 as uuidV4} from "uuid";

/**
 * @method createContext
 * @description create a context object for interacting with the models.  Note this does not
 * register the context with the store.
 *
 * @param {Object} obj
 * @param {String} obj.file path to the file being processed
 * @param {Object} obj.requestor user object of the requester
 * @param {String} obj.corkTraceId context cork trace id
 *
 * @returns {Promise<Object>} context object
 */
async function createContext(obj) {
  if( !obj.corkTraceId ) {
    obj.corkTraceId = uuid4();
  }

  let context = new FileContext(obj);
  await context.update(obj);
  return context;
}


class FileContext {

  constructor() {
    this._corkTraceId = null;
    this._file = null;
    this._requestor = null;
    this.logSignal = null;
  }

  // corkTraceId is used for logging and tracing
  set corkTraceId(corkTraceId) {
    this._corkTraceId = corkTraceId;
    this.logSignal.corkTraceId = corkTraceId;
  }
  get corkTraceId() {
    return this._corkTraceId;
  }

  set file(file) {
    this._file = file;
    this.logSignal.file = file;
  }
  get file() {
    return this._file;
  }

  set requestor(requestor) {
    this._requestor = requestor;
    this.logSignal.requestor = requestor;
  }
  get requestor() {
    return this._requestor;
  }

  async update(obj={}) {
    if( obj.corkTraceId ) {
      this.corkTraceId = obj.corkTraceId;
    }
    if( obj.file ) {
      this.file = obj.file;
    }
    if( obj.requestor ) {
      this.requestor = obj.requestor;
    }
  }

}

export default createContext;