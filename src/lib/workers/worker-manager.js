import WorkerQueue from './worker-queue.js';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @class WorkerManager
 * @description Singleton class to manage the worker queue
 */
class WorkerManager {
  constructor() {
    this.queue = null;
  }
  
  /**
   * @method initialize
   * @description Initialize the worker queue with configured worker types
   * 
   * @param {Object} opts
   * @param {Number} opts.maxWorkers - Maximum number of workers per type
   * @param {Object} opts.dbClient - Database client to pass to workers
   * @param {Object} opts.cas - CAS instance to pass to workers
   * @returns {WorkerQueue}
   */
  initialize(opts = {}) {
    if (this.queue) {
      return this.queue;
    }
    
    const maxWorkers = opts.maxWorkers || config.workers?.maxWorkers || 4;
    
    this.queue = new WorkerQueue({
      maxWorkers,
      workerTypes: {
        'ld-parser': {
          scriptPath: path.join(__dirname, 'ld-parser-worker.js'),
          workerData: {
            dbType: opts.dbType || config.database?.type,
            // Note: dbClient and cas cannot be passed directly to workers
            // Workers will create their own instances
          }
        },
        'hash': {
          scriptPath: path.join(__dirname, 'hash-worker.js'),
          workerData: {}
        }
      }
    });
    
    return this.queue;
  }
  
  /**
   * @method get
   * @description Get the worker queue instance
   * 
   * @returns {WorkerQueue}
   */
  get() {
    if (!this.queue) {
      throw new Error('WorkerQueue not initialized. Call initialize() first.');
    }
    return this.queue;
  }
  
  /**
   * @method parseLinkedData
   * @description Convenience method to parse linked data in a worker
   * 
   * @param {Object} file - File metadata object
   * @returns {Promise<Object>}
   */
  async parseLinkedData(file) {
    const queue = this.get();
    return queue.execute('ld-parser', 'parseLinkedData', { file });
  }
  
  /**
   * @method calculateFileHash
   * @description Convenience method to calculate file hash in a worker
   * 
   * @param {String} filePath - Path to the file
   * @param {String|Array} algorithms - Hash algorithm(s) to use
   * @returns {Promise<Object>}
   */
  async calculateFileHash(filePath, algorithms = ['sha256', 'md5']) {
    const queue = this.get();
    return queue.execute('hash', 'calculateHash', { filePath, algorithms });
  }
  
  /**
   * @method getStats
   * @description Get worker queue statistics
   * 
   * @returns {Object}
   */
  getStats() {
    if (!this.queue) {
      return { initialized: false };
    }
    return this.queue.getStats();
  }
  
  /**
   * @method shutdown
   * @description Shutdown the worker queue
   * 
   * @returns {Promise}
   */
  async shutdown() {
    if (this.queue) {
      await this.queue.shutdown();
      this.queue = null;
    }
  }
}

// Export singleton instance
const workerManager = new WorkerManager();
export default workerManager;
