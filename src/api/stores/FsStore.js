import {LruStore} from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class FsStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      delete: new LruStore({name: 'fs.delete'}),
      metadata: new LruStore({name: 'fs.metadata'}),
      fileContents: new LruStore({name: 'fs.fileContents', maxSize: 10}),
      uploadFile: new LruStore({name: 'fs.upload.file'}, {maxSize: 500}),
      uploadFileEntry: new LruStore({name: 'fs.upload.file.entry'}, {maxSize: 100})
    };
    this.events = {
      FS_UPLOAD_PROGRESS_UPDATE: 'fs-upload-progress-update',
      FS_UPLOAD_TRACKER_VISIBILITY_UPDATE: 'fs-upload-tracker-visibility-update'
    };
    this.uploadProgressThreshold = 5; // only emit progress update for every 5% change to avoid excessive updates
  }

}

const store = new FsStore();
export default store;