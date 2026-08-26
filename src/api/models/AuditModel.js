import {BaseModel} from '@ucd-lib/cork-app-utils';
import AuditService from '../services/AuditService.js';
import AuditStore from '../stores/AuditStore.js';

class AuditModel extends BaseModel {

  constructor() {
    super();

    this.store = AuditStore;
    this.service = AuditService;

    this.register('AuditModel');
  }

  /**
   * @description Get the full audit history for one file or directory, oldest first.
   * @param {String} path - resource path (file or directory)
   * @param {Boolean} [isFile=false] - true if path names a file, false for a directory
   * @param {Object} appStateOptions
   * @returns {Promise<Object>} store record whose payload is {entries: Array<Object>}
   */
  getLog(path, isFile=false, appStateOptions={}) {
    return this.service.getLog(path, isFile, appStateOptions);
  }

}

const model = new AuditModel();
export default model;
