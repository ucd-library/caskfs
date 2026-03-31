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

    this.ctl = { 
      directoryPath: new DirectoryPathController(this),
    }

    this._injectModel('FsModel', 'AppStateModel');
  }

  _onFsUploadProgressUpdate(e) {
    console.log('FS_UPLOAD_PROGRESS_UPDATE', e);
    const now = Date.now();

    if ( e.entityType === 'entry' ){
      let upload;
      const existing = this.uploads.find(upload => upload.record.id === e.entity.id);
      if ( existing ) {
        existing.record = e.entity;
        existing.updated = now;
        upload = existing;
      } else {
        upload = { record: e.entity, started: now, updated: now };
        this.uploads.push(upload);
      }
      this.maybeScheduleToast(upload);
    }

    
  }

  async maybeScheduleToast(upload){
    if ( !this.showToastForUploadsSince ) {
      this.showToastForUploadsSince = upload.started;
    }
    console.log(upload, this.showToastForUploadsSince, this.FsModel.uploadInProgress);
    if ( upload.record.state === 'loading' || this.FsModel.uploadInProgress ) return;

    // no toast if user is currently viewing the tracker, since they can see the progress there
    if ( this.visible ) {
      this.showToastForUploadsSince = null;
      return;
    }

    // TODO: Move this to a timeout that only gets scheduled once to deal with race conditions.
    const uploads = this.uploads.filter( upload => upload.started >= this.showToastForUploadsSince );
    this.showToastForUploadsSince = null;
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

    if ( uploads.filter( upload => upload.record.state === 'loaded').every(upload => upload.record.destDir === this.ctl.directoryPath.pathname ) ){
      this.AppStateModel.refresh({ scrollToLastPosition: true } );
    }


  }

  // _onFsUploadProgressUpdate(e) {
  //   console.log('FS_UPLOAD_PROGRESS_UPDATE', e);
  //   const now = Date.now();
  //   const pastWindow = this.windowStart && (now - this.windowStart > this.windowLength);

  //   if ( e.entityType === 'entry' ){

  //     const existing = this.uploads.find(upload => upload.record.id === e.entity.id);
  //     if ( existing ) {
  //       existing.record = e.entity;
  //       existing.updated = now;
  //     } else {
  //       this.uploads.push({ record: e.entity, started: now, updated: now });
  //     }
  //   }

  //   if ( !this.windowStart ) {
  //     this.windowStart = now;
  //   }

  //   // wait for another upload to come in or for window to elapse before showing tracker or toast
  //   if ( pastWindow && !this.pastWindowTimeout ) {
  //     this.pastWindowTimeout = setTimeout(() => {
  //       this._onPastWindow();
  //       this.pastWindowTimeout = null;
  //       const mostRecentUpload = this.mostRecentUpload();
  //       if ( mostRecentUpload?.record?.state !== 'loading' ){
  //         this.windowStart = null;
  //       }
  //     }, 1000);
  //   }
  // }

  mostRecentUpload() {
    return this.uploads.reduce((mostRecent, upload) => {
      return !mostRecent || upload.updated > mostRecent.updated ? upload : mostRecent;
    }, null);
  }

}

customElements.define('caskfs-upload-tracker', CaskfsUploadTracker);