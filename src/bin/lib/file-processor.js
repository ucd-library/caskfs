import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH  = path.join(__dirname, 'file-processor-worker.js');

/**
 * @class FileProcessor
 * @description Manages a pool of child processes that compute file hashes and git
 * metadata in parallel.  Each worker handles one file at a time; a simple FIFO
 * queue distributes work to idle workers so no worker is ever starved while
 * another idles.
 *
 * Typical usage:
 *
 *   const processor = new FileProcessor({ workers: 3 });
 *   const results   = await processor.processBatch(filePaths);
 *   processor.close();
 *
 * Each element of `results` has the shape:
 *   { filePath: String, hash: String, gitInfo: Object|null }
 *
 * Errors from individual files are surfaced as rejected promises; the caller
 * should catch them per-file if partial failures are acceptable.
 */
class FileProcessor {

  /**
   * @param {Object} [opts={}]
   * @param {Number} [opts.workers=3] - number of child-process workers to spawn
   */
  constructor(opts={}) {
    this.workerCount  = opts.workers || 3;
    this._workers     = [];
    this._idle        = [];       // child processes currently waiting for work
    this._queue       = [];       // pending { id, filePath, resolve, reject }
    this._callbacks   = new Map(); // id → { resolve, reject }
    this._idCounter   = 0;
    this._started     = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * @method processBatch
   * @description Process an array of file paths through the worker pool and
   * return results in the same order as the input.
   *
   * @param {String[]} filePaths - absolute paths to process
   * @returns {Promise<Array<{filePath: String, hash: String, gitInfo: Object|null}>>}
   */
  async processBatch(filePaths) {
    this._ensureStarted();
    return Promise.all(filePaths.map(fp => this._enqueue(fp)));
  }

  /**
   * @method close
   * @description Terminate all worker processes.  Any pending work will
   * never complete — call only after processBatch has resolved.
   */
  close() {
    for (const w of this._workers) {
      w.kill();
    }
    this._workers   = [];
    this._idle      = [];
    this._queue     = [];
    this._callbacks.clear();
    this._started   = false;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * @method _ensureStarted
   * @description Spawn worker processes the first time work is submitted.
   */
  _ensureStarted() {
    if (this._started) return;
    this._started = true;

    for (let i = 0; i < this.workerCount; i++) {
      const child = fork(WORKER_PATH, [], { execArgv: process.execArgv });
      child.on('message', msg => this._onResult(child, msg));
      this._workers.push(child);
      this._idle.push(child);
    }
  }

  /**
   * @method _enqueue
   * @description Queue a single file for processing.  If a worker is idle it
   * is dispatched immediately; otherwise the work sits in the queue until one
   * becomes free.
   *
   * @param {String} filePath
   * @returns {Promise<{filePath: String, hash: String, gitInfo: Object|null}>}
   */
  _enqueue(filePath) {
    const id = ++this._idCounter;
    return new Promise((resolve, reject) => {
      const item = { id, filePath, resolve, reject };
      if (this._idle.length > 0) {
        this._dispatch(this._idle.pop(), item);
      } else {
        this._queue.push(item);
      }
    });
  }

  /**
   * @method _dispatch
   * @description Send a work item to a specific worker process.
   *
   * @param {ChildProcess} worker
   * @param {{ id: Number, filePath: String, resolve: Function, reject: Function }} item
   */
  _dispatch(worker, item) {
    this._callbacks.set(item.id, { resolve: item.resolve, reject: item.reject });
    worker.send({ id: item.id, filePath: item.filePath });
  }

  /**
   * @method _onResult
   * @description Handle a result message from a worker.  Resolves (or rejects)
   * the promise for that item, then immediately dispatches the next queued item
   * to the now-idle worker (or marks it idle if the queue is empty).
   *
   * @param {ChildProcess} worker - the worker that sent the result
   * @param {{ id: Number, filePath: String, hash: String, gitInfo: Object, error: String }} msg
   */
  _onResult(worker, msg) {
    const cb = this._callbacks.get(msg.id);
    if (!cb) return;
    this._callbacks.delete(msg.id);

    if (msg.error) {
      cb.reject(new Error(msg.error));
    } else {
      cb.resolve({ filePath: msg.filePath, hash: msg.hash, gitInfo: msg.gitInfo });
    }

    if (this._queue.length > 0) {
      this._dispatch(worker, this._queue.shift());
    } else {
      this._idle.push(worker);
    }
  }

}

export default FileProcessor;
