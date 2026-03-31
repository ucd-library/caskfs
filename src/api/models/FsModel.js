import {BaseModel, digest} from '@ucd-lib/cork-app-utils';
import FsService from '../services/FsService.js';
import FsStore from '../stores/FsStore.js';
import clearCache from '../utils/clearCache.js';

class FsModel extends BaseModel {

  constructor() {
    super();

    this.store = FsStore;
    this.service = FsService;

    // How many files to upload concurrently per upload() call.
    // Not a limit on total concurrent uploads across the app. Not sure that is needed but could be added if so.
    this.maxConcurrentUploads = 1;
    
    // How many times to retry an individual file upload on failure before giving up and marking it as an error
    this.uploadRetries = 3;

    // if false, files starting with . will be filtered out of directory uploads
    this.enableDotFileUpload = false; 
      
    this.register('FsModel');

    this.inject('DirectoryModel');
  }

  /**
   * Upload files to a destination directory, with concurrency limiting and per-file retries.
   * Creates one uploadFileEntry store record per FileSystemEntry (folder or file) in fileOrDir.
   * @param {Array<{entry: FileSystemEntry, files: File[]}>} fileOrDir - result of UploadUtils.getFilesFromDragEvent
   * @param {string} destDir - destination directory path
   * @param {object} opts
   * @param {boolean} opts.replace - replace existing files
   * @param {string} opts.mimeType - MIME type override
   * @returns {Promise<object[]>} the final uploadFileEntry store records
   */
  async upload(fileOrDir, destDir, opts={}) {
    const appStateOptions = {
      errorSettings: { suppressError: true },
      loaderSettings: { suppressLoader: true }
    };
    const store = this.store.data.uploadFileEntry;

    const timestamp = Date.now();

    // create one entry record per FileSystemEntry
    const entryRecords = await Promise.all(
      fileOrDir.map(async ({ entry, files }) => {
        const id = await digest({ name: entry.name, destDir, timestamp });
        if (!this.enableDotFileUpload && entry.isDirectory) {
          files = files.filter(f => !f.name.startsWith('.'));
        }
        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
        const record = {
          id,
          state: 'loading',
          name: entry.name,
          isDirectory: entry.isDirectory,
          destDir,
          totalFiles: files.length,
          totalBytes,
          completedFiles: 0,
          completedBytes: 0,
          failedFiles: []
        };
        if ( files.length === 1 && !entry.isDirectory ) {
          record.fileId = await digest({ destDir, filename: files[0].webkitRelativePath || files[0].name, ...opts });
        }
        this.store.set(record, store, null, appStateOptions);
        this.emit(this.store.events.FS_UPLOAD_PROGRESS_UPDATE, { entityType: 'entry', entity: record });
        return { record, files };
      })
    );

    // flat queue of { file, record } pairs across all entries
    const queue = entryRecords.flatMap(({ record, files }) =>
      files.map(file => ({ file, record }))
    );

    const runNext = async () => {
      if (queue.length === 0) return;
      const { file, record } = queue.shift();

      const result = await this._uploadWithRetry(file, destDir, opts);

      record.completedFiles++;
      record.completedBytes += file.size;
      if (result.state === 'error') {
        record.failedFiles.push({ file: file.relativePath || file.name, error: result.error });
      }

      if (record.completedFiles === record.totalFiles) {
        record.state = (record.failedFiles.length === record.totalFiles) ? 'error' : 'loaded';
        this.store.set(record, store, null, appStateOptions);
      }
      this.emit(this.store.events.FS_UPLOAD_PROGRESS_UPDATE, { entityType: 'entry', entity: record });

      await runNext();
    };

    await Promise.all(
      Array.from({ length: Math.min(this.maxConcurrentUploads, queue.length) }, () => runNext())
    );

    const records = entryRecords.map(({ record }) => store.get(record.id));
    if ( records.some(r => r.state === 'loaded') ) {
      clearCache();
    }
    return records;
  }

  /**
   * Upload a single file, retrying up to this.uploadRetries times on failure.
   * @param {File} file
   * @param {string} destDir
   * @param {object} opts
   * @returns {Promise<object>} the uploadFile store record
   */
  async _uploadWithRetry(file, destDir, opts) {
    let result;
    for (let attempt = 0; attempt <= this.uploadRetries; attempt++) {
      result = await this.service.uploadFile(destDir, file, opts);
      if (result.state !== 'error') return result;
    }
    return result;
  }

  get uploadInProgress(){
    const store = this.store.data.uploadFileEntry;
    return Array.from(store.cache.values()).some(entry => entry.state === 'loading');
  }

  async delete(path, options={}) {
    const res = await this.service.delete(path, options);
    if ( res.state === 'loaded' ) {
      clearCache();
    }
    return res;
  }

  getMetadata(path) {
    return this.service.getMetadata(path);
  }

  getFileContents(path) {
    return this.service.getFileContents(path);
  }

  fileDownloadUrl(path) {
    return `${this.service.baseUrl}${path}`;
  }

}

const model = new FsModel();
export default model;