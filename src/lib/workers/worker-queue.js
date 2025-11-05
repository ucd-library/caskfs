import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { getLogger } from '../logger.js';

/**
 * @class WorkerQueue
 * @description A worker queue system that manages multiple worker threads to execute tasks.
 * Supports different worker types and provides a promise-based API.
 */
class WorkerQueue extends EventEmitter {
  constructor(opts = {}) {
    super();
    
    this.logger = getLogger('worker-queue');
    
    // Configuration
    this.maxWorkers = opts.maxWorkers || 4;
    this.workerTypes = opts.workerTypes || {};
    
    // Worker management
    this.workers = new Map(); // workerType -> Worker[]
    this.availableWorkers = new Map(); // workerType -> Worker[]
    this.busyWorkers = new Map(); // workerType -> Worker[]
    
    // Queue management
    this.taskQueue = new Map(); // workerType -> Task[]
    this.pendingTasks = new Map(); // taskId -> Task
    
    // Stats
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksQueued: 0
    };
    
    this.taskIdCounter = 0;
    
    // Initialize worker pools for each type
    for (const workerType of Object.keys(this.workerTypes)) {
      this.workers.set(workerType, []);
      this.availableWorkers.set(workerType, []);
      this.busyWorkers.set(workerType, []);
      this.taskQueue.set(workerType, []);
    }
  }
  
  /**
   * @method execute
   * @description Execute a task in a worker thread
   * 
   * @param {String} workerType - The type of worker to use
   * @param {String} method - The method to call in the worker
   * @param {*} data - Data to pass to the worker
   * @returns {Promise} Promise that resolves with the worker result
   */
  async execute(workerType, method, data) {
    if (!this.workerTypes[workerType]) {
      throw new Error(`Unknown worker type: ${workerType}`);
    }
    
    const taskId = ++this.taskIdCounter;
    
    return new Promise((resolve, reject) => {
      const task = {
        id: taskId,
        workerType,
        method,
        data,
        resolve,
        reject,
        createdAt: Date.now()
      };
      
      this.stats.tasksQueued++;
      this.pendingTasks.set(taskId, task);
      
      this.logger.debug(`Task ${taskId} queued for ${workerType}.${method}`);
      
      // Try to execute immediately if worker available
      const worker = this._getAvailableWorker(workerType);
      if (worker) {
        this._executeTask(worker, task);
      } else {
        // Add to queue
        this.taskQueue.get(workerType).push(task);
        this.logger.debug(`Task ${taskId} added to queue. Queue size: ${this.taskQueue.get(workerType).length}`);
      }
    });
  }
  
  /**
   * @method _getAvailableWorker
   * @description Get an available worker or create a new one if under the limit
   * 
   * @param {String} workerType 
   * @returns {Worker|null}
   */
  _getAvailableWorker(workerType) {
    const available = this.availableWorkers.get(workerType);
    
    if (available.length > 0) {
      return available.shift();
    }
    
    // Create new worker if under limit
    const totalWorkers = this.workers.get(workerType).length;
    if (totalWorkers < this.maxWorkers) {
      return this._createWorker(workerType);
    }
    
    return null;
  }
  
  /**
   * @method _createWorker
   * @description Create a new worker thread
   * 
   * @param {String} workerType 
   * @returns {Worker}
   */
  _createWorker(workerType) {
    const workerConfig = this.workerTypes[workerType];
    const worker = new Worker(workerConfig.scriptPath, {
      workerData: workerConfig.workerData || {}
    });
    
    worker.workerType = workerType;
    worker.currentTaskId = null;
    
    worker.on('message', (message) => {
      this._handleWorkerMessage(worker, message);
    });
    
    worker.on('error', (error) => {
      this._handleWorkerError(worker, error);
    });
    
    worker.on('exit', (code) => {
      this._handleWorkerExit(worker, code);
    });
    
    this.workers.get(workerType).push(worker);
    this.availableWorkers.get(workerType).push(worker);
    
    this.logger.debug(`Created new ${workerType} worker. Total: ${this.workers.get(workerType).length}`);
    
    return worker;
  }
  
  /**
   * @method _executeTask
   * @description Execute a task on a worker
   * 
   * @param {Worker} worker 
   * @param {Object} task 
   */
  _executeTask(worker, task) {
    worker.currentTaskId = task.id;
    
    // Move worker to busy list
    const available = this.availableWorkers.get(task.workerType);
    const busy = this.busyWorkers.get(task.workerType);
    const index = available.indexOf(worker);
    if (index > -1) {
      available.splice(index, 1);
    }
    busy.push(worker);
    
    this.logger.debug(`Executing task ${task.id} on ${task.workerType} worker`);
    
    // Send task to worker
    worker.postMessage({
      taskId: task.id,
      method: task.method,
      data: task.data
    });
  }
  
  /**
   * @method _handleWorkerMessage
   * @description Handle message from worker
   * 
   * @param {Worker} worker 
   * @param {Object} message 
   */
  _handleWorkerMessage(worker, message) {
    const task = this.pendingTasks.get(message.taskId);
    
    if (!task) {
      this.logger.warn(`Received message for unknown task ${message.taskId}`);
      return;
    }
    
    const duration = Date.now() - task.createdAt;
    
    if (message.error) {
      this.logger.error(`Task ${task.id} failed after ${duration}ms:`, message.error);
      this.stats.tasksFailed++;
      task.reject(new Error(message.error));
    } else {
      this.logger.debug(`Task ${task.id} completed in ${duration}ms`);
      this.stats.tasksCompleted++;
      task.resolve(message.result);
    }
    
    this.pendingTasks.delete(message.taskId);
    
    // Mark worker as available and process next task
    this._markWorkerAvailable(worker);
    this._processNextTask(worker.workerType);
  }
  
  /**
   * @method _handleWorkerError
   * @description Handle worker error
   * 
   * @param {Worker} worker 
   * @param {Error} error 
   */
  _handleWorkerError(worker, error) {
    this.logger.error(`Worker error in ${worker.workerType}:`, error);
    
    if (worker.currentTaskId) {
      const task = this.pendingTasks.get(worker.currentTaskId);
      if (task) {
        this.stats.tasksFailed++;
        task.reject(error);
        this.pendingTasks.delete(worker.currentTaskId);
      }
    }
    
    // Remove worker from pools
    this._removeWorker(worker);
    
    // Try to process next task with a new worker
    this._processNextTask(worker.workerType);
  }
  
  /**
   * @method _handleWorkerExit
   * @description Handle worker exit
   * 
   * @param {Worker} worker 
   * @param {Number} code 
   */
  _handleWorkerExit(worker, code) {
    if (code !== 0) {
      this.logger.error(`Worker ${worker.workerType} exited with code ${code}`);
    }
    
    this._removeWorker(worker);
  }
  
  /**
   * @method _markWorkerAvailable
   * @description Mark a worker as available
   * 
   * @param {Worker} worker 
   */
  _markWorkerAvailable(worker) {
    worker.currentTaskId = null;
    
    const busy = this.busyWorkers.get(worker.workerType);
    const available = this.availableWorkers.get(worker.workerType);
    
    const index = busy.indexOf(worker);
    if (index > -1) {
      busy.splice(index, 1);
    }
    available.push(worker);
  }
  
  /**
   * @method _removeWorker
   * @description Remove a worker from all pools
   * 
   * @param {Worker} worker 
   */
  _removeWorker(worker) {
    const workerType = worker.workerType;
    
    const workers = this.workers.get(workerType);
    const available = this.availableWorkers.get(workerType);
    const busy = this.busyWorkers.get(workerType);
    
    const removeFromArray = (arr, item) => {
      const index = arr.indexOf(item);
      if (index > -1) arr.splice(index, 1);
    };
    
    removeFromArray(workers, worker);
    removeFromArray(available, worker);
    removeFromArray(busy, worker);
    
    this.logger.debug(`Removed ${workerType} worker. Remaining: ${workers.length}`);
  }
  
  /**
   * @method _processNextTask
   * @description Process the next task in the queue for a worker type
   * 
   * @param {String} workerType 
   */
  _processNextTask(workerType) {
    const queue = this.taskQueue.get(workerType);
    
    if (queue.length === 0) {
      return;
    }
    
    const worker = this._getAvailableWorker(workerType);
    if (!worker) {
      return;
    }
    
    const task = queue.shift();
    this._executeTask(worker, task);
  }
  
  /**
   * @method getStats
   * @description Get queue statistics
   * 
   * @returns {Object}
   */
  getStats() {
    const queueSizes = {};
    const workerCounts = {};
    
    for (const [workerType, queue] of this.taskQueue.entries()) {
      queueSizes[workerType] = queue.length;
      workerCounts[workerType] = {
        total: this.workers.get(workerType).length,
        available: this.availableWorkers.get(workerType).length,
        busy: this.busyWorkers.get(workerType).length
      };
    }
    
    return {
      ...this.stats,
      queueSizes,
      workerCounts,
      pendingTasks: this.pendingTasks.size
    };
  }
  
  /**
   * @method shutdown
   * @description Shutdown all workers and reject pending tasks
   * 
   * @returns {Promise}
   */
  async shutdown() {
    this.logger.info('Shutting down worker queue...');
    
    // Reject all pending tasks
    for (const task of this.pendingTasks.values()) {
      task.reject(new Error('Worker queue shutting down'));
    }
    this.pendingTasks.clear();
    
    // Clear queues
    for (const queue of this.taskQueue.values()) {
      queue.length = 0;
    }
    
    // Terminate all workers
    const terminationPromises = [];
    for (const workers of this.workers.values()) {
      for (const worker of workers) {
        terminationPromises.push(worker.terminate());
      }
    }
    
    await Promise.all(terminationPromises);
    
    this.workers.clear();
    this.availableWorkers.clear();
    this.busyWorkers.clear();
    
    this.logger.info('Worker queue shutdown complete');
  }
}

export default WorkerQueue;
