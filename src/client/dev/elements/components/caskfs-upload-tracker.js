import { LitElement } from 'lit';
import {render, styles} from "./caskfs-upload-tracker.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import uploadUtils from '../../utils/uploadUtils.js';

/**
 * @description Component to track progress of file uploads.
 * @property {Array} uploads - list of recent uploads with progress info
 */
export default class CaskfsUploadTracker extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      uploads: { type: Array },
      visible: { type: Boolean },
      displayLimit: { type: Number }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.uploads = [];
    this.visible = false;
    this.displayLimit = 20;

    this.ctl = { 
      directoryPath: new DirectoryPathController(this, {alwaysSyncOnAppStateUpdate: true}),
    }

    this._injectModel('FsModel', 'AppStateModel');
  }

  willUpdate(props){
    if ( props.has('visible') ){
      this.visible ? this.FsModel.showUploadTracker() : this.FsModel.hideUploadTracker();
    }
  }

  _onFsUploadTrackerVisibilityUpdate(e){
    this.visible = e.visible;
  }

  /**
   * @description Handle upload progress events emitted by FsModel. Has two types of events:
   * 1. Entry uploads - represents a FileSystemEntry, which may contain multiple files (e.g. a directory). Fires when each of its file upload completes.
   * 2. File uploads - represents each individual file of the FileSystemEntry. Fires from the xhr.upload.onprogress event, so has more granular progress info
   * @param {*} e 
   */
  _onFsUploadProgressUpdate(e) {
    const now = Date.now();
    let doUpdate = false;

    // for entry uploads, progress event is emitted after each file in the entry is uploaded
    if ( e.entityType === 'entry' ){
      let upload;
      doUpdate = true;
      const existing = this.uploads.find(upload => upload.record.id === e.entity.id);
      if ( existing ) {
        existing.record = e.entity;
        existing.updated = now;
        upload = existing;
      } else {
        upload = { record: e.entity, started: now, updated: now };
        this.uploads.push(upload);
      }
      this.setUploadProgess(upload);
      this.scheduleToastIfHidden(upload);
      this.refreshIfCurrentDirectory(upload);

      // for single file uploads, we track progress of the file rather than the entry
    } else if ( e.entityType === 'file' ) {
      const uploadEntry = this.uploads.find(upload => upload.record.fileId === e.entity.id);
      if ( uploadEntry ){
        uploadEntry.file = e.entity;
        uploadEntry.updated = now;
        this.setUploadProgess(uploadEntry);
        doUpdate = true;
      }
    }

    if ( doUpdate ){
      this.requestUpdate();
    }
  }

  /**
   * @description Sets the percent complete for an upload
   * @param {Object} upload - object from this.uploads
   */
  setUploadProgess(upload){
    let totalBytes = 0;
    let completedBytes = 0;
    if ( upload.file ){
      totalBytes = upload.file.totalBytes;
      completedBytes = upload.file.completedBytes;
    } else {
      totalBytes = upload.record.totalBytes;
      completedBytes = upload.record.completedBytes;
    }
    upload.progress = totalBytes ? Math.round((completedBytes / totalBytes) * 100) : 0;
  }

  /**
   * @description Refreshes the current directory if the upload that just completed is for the current directory, to show the newly uploaded file(s).
   * @param {Object} upload - object from this.uploads
   * @returns 
   */
  refreshIfCurrentDirectory(upload){
    if ( upload.record.state !== 'loaded' ) return;
    if ( upload.record.destDir === this.ctl.directoryPath.pathname ){
      this.AppStateModel.refresh({ scrollToLastPosition: true });
    }
  }

  /**
   * @description Schedules toast notification when upload completes if user is not currently viewing the tracker.
   * @param {Object} upload - object from this.uploads for which a toast should be scheduled.
   * @returns 
   */
  async scheduleToastIfHidden(upload){
    if ( !this.showToastForUploadsSince ) {
      this.showToastForUploadsSince = upload.started;
    }
    if ( upload.record.state === 'loading' || this.FsModel.uploadInProgress ) return;

    if ( this.toastTimeout ){
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.toastTimeout = setTimeout(() => {
      // no toast if user is currently viewing the tracker, since they can see the progress there
      if ( this.visible ) {
        this.showToastForUploadsSince = null;
        return;
      }

      const uploads = this.uploads.filter( upload => upload.started >= this.showToastForUploadsSince );
      this.showToastForUploadsSince = null;
      if ( uploads.length === 0 ) return;
      let toastType, toastText;

      // all entries successful, but individual files may have failed
      if ( uploads.every(upload => upload.record.state === 'loaded') ) {

        // every file successful
        if ( uploads.every(upload => !upload.record.failedFiles.length) ) {
          toastType = 'success';

          if ( uploads.length === 1 ){
            const upload = uploads[0];
            const filename = uploadUtils.normalizeFileName(upload.record.name);
            toastText = `Uploaded ${filename}`;
          } else {
            toastText = `Upload${uploads.length > 1 ? 's' : ''} completed`;
          }

        // some files failed
        } else {
          toastType = 'warning';
          const failedCt = uploads.reduce((sum, upload) => sum + upload.record.failedFiles.length, 0);
          toastText = `Upload completed with ${failedCt} failed file${failedCt > 1 ? 's' : ''}`;
        }

        // all entries failed
      } else if ( uploads.every(upload => upload.record.state === 'error') ) {
        toastType = 'error';
        toastText = `Upload${uploads.length > 1 ? 's' : ''} failed`;
      } else if ( uploads.some(upload => upload.record.state === 'error') ) {
        toastType = 'warning';
        toastText = `Upload${uploads.length > 1 ? 's' : ''} completed with some errors`;
      } else {
        toastType = 'success';
        toastText = `Upload${uploads.length > 1 ? 's' : ''} completed`;
      }

      this.AppStateModel.showToast({ text: toastText, type: toastType });

    }, 200);

  }

  mostRecentUpload() {
    return this.uploads.reduce((mostRecent, upload) => {
      return !mostRecent || upload.updated > mostRecent.updated ? upload : mostRecent;
    }, null);
  }

}

customElements.define('caskfs-upload-tracker', CaskfsUploadTracker);