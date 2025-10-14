import {v4 as uuidV4} from "uuid";
import config from './config.js';

const LOG_SIGNAL_PROPERTIES = new Set([
  'corkTraceId',
  'user',
  'role',
  'filePath',
  'directory',
  'requestor'
]);

function createContext(obj={}, dbClient=null) {
  if( obj instanceof CaskFSContext ) {
    obj.setDbClientIfNotSet(dbClient);
    return obj;
  }
  return new CaskFSContext(obj, dbClient);
}

class CaskFSContext {

  constructor(obj={}, dbClient=null) {
    this.data = {
      corkTraceId: obj.corkTraceId || uuidV4(),
      requestor: obj.requestor || config.acl.defaultRequestor,
      dbClient: dbClient || null
    }

    this.logSignal = {};
  }

  update(obj={}) {
    Object.keys(obj).forEach(k => {
      this.data[k] = obj[k];
      
      if( LOG_SIGNAL_PROPERTIES.has(k) ) {
        this.logSignal[k] = obj[k];
      }
    });
  }

  setDbClientIfNotSet(dbClient) {
    if( !dbClient ) return;
    if( !this.data.dbClient ) {
      this.data.dbClient = dbClient;
    }
  }

}

export {createContext, CaskFSContext};