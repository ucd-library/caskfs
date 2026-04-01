import { html, css } from 'lit';
import uploadUtils from '../../utils/uploadUtils.js';
import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    .container {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 10000;
      display: block;
      max-width: 500px;
      min-width: 400px;
      border: 1px solid var(--ucd-black-40, #999);
      background: white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .upload-tracker__header {
      font-weight: 700;
      padding: .5rem .25rem .5rem 1rem;
      border-bottom: 1px solid var(--ucd-black-40, #999);
      background-color: var(--ucd-blue, #022851);
      border: 1px solid var(--ucd-blue, #022851);
      color: white;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-content: space-between;
      --cork-icon-button-size: 1.5rem;
    }
    .upload-tracker__content {
      display: block;
      max-height: 200px;
      overflow-y: auto;
    }
    .upload-tracker__upload {
      padding: .5rem;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);

    }
    .upload-tracker__upload-main-info {
      display: flex;
      flex-wrap: wrap;
      gap: .5rem;
      justify-content: space-between;
      align-items: flex-start;
    }
    .upload-tracker__upload cork-icon {
      --cork-icon-size: 1rem;
      margin-top: .25rem;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .upload-tracker__upload--loading cork-icon {
      animation: spin 1s linear infinite;
      color: var(--ucd-blue-80, #13639e);
    }
    .upload-tracker__upload--loaded cork-icon {
      color: var(--quad, #3dae2b);
    }
    .upload-tracker__upload--error cork-icon {
      color: var(--double-decker, #c10230);
    }
    .upload-tracker__upload--warning cork-icon {
      color: var(--poppy, #f18a00);
    }
    .upload-tracker__upload-name {
      display: flex;
      align-items: flex-start;
      gap: 0.25rem;
      word-break: break-all;
    }
    .upload-tracker__upload-complete {
      font-size: .875rem;
      color: var(--ucd-blue, #022851);
      margin-top: .1rem;
    }
    .upload-tracker__upload--loading .upload-tracker__upload-complete {
      display: none;
    }
    .upload-tracker__upload progress {
      width: 100px;
      height: .5rem;
      margin-top: .55rem;
      appearance: none;
      -webkit-appearance: none;
      background-color: var(--ucd-blue-60, #B0D0ED);
      border-radius: 999px;
      display: none;
    }
    .upload-tracker__upload--loading progress {
      display: block;
    }

    /* Chrome / Safari */
    .upload-tracker__upload--loading progress::-webkit-progress-bar {
      background-color: var(--ucd-blue-60, #B0D0ED);
      border-radius: 999px;
    }

    .upload-tracker__upload--loading progress::-webkit-progress-value {
      background-color: var(--ucd-blue-80, #13639e);
      border-radius: 999px;
    }

    /* Firefox */
    .upload-tracker__upload--loading progress::-moz-progress-bar {
      background-color: var(--ucd-blue-80, #13639e);
      border-radius: 999px;
    }

    .upload-tracker__upload-details {
      display: none;
      font-size: .875rem;
    }
    .upload-tracker__upload--warning .upload-tracker__upload-details {
      display: block;
    }
    .upload-tracker__no-uploads {
      padding: 1rem;
    }


  `;

  return [elementStyles];
}

export function render() { 
  const uploadsToDisplay = [...this.uploads].reverse().slice(0, this.displayLimit);
  return html`
    <div class='container' ?hidden=${!this.visible}>
      <div class='upload-tracker__header'>
        <div>Recent Uploads</div>
        <cork-icon-button 
          color="dark"
          icon="fas.xmark"
          title="Close Upload Tracker"
          @click=${() => this.visible = false}
        ></cork-icon-button>
      </div>
      <div class='upload-tracker__content'>
        ${uploadsToDisplay.map(upload => _renderUpload.call(this, upload))}
        <div ?hidden=${!!uploadsToDisplay.length} class='upload-tracker__no-uploads'>
          No recent uploads
        </div>
      </div>
    </div>
  `;
}

function _renderUpload(upload) {
  const state = upload.record.state !== 'loading' && upload.record.isDirectory && upload.record.failedFiles.length ? 'warning' : upload.record.state;
  const icons = {
    loading: 'fas.spinner',
    loaded: 'fas.circle-check',
    error: 'fas.circle-exclamation',
    warning: 'fas.circle-exclamation'
  }
  const filepath = uploadUtils.joinPath([upload.record.destDir, upload.record.name], {leadingSlash: true});
  return html`
    <div class='upload-tracker__upload upload-tracker__upload--${state}'>
      <div class='upload-tracker__upload-main-info'>
        <div class='upload-tracker__upload-name'>
          <cork-icon icon=${icons[state]}></cork-icon>
          <a href=${appUrlUtils.fullLocation(`${upload.record.isDirectory ? 'directory' : 'file'}${filepath}`)}>${filepath}</a>
        </div>
        <div class='upload-tracker__upload-complete'>Complete</div>
        <progress value=${upload.progress} max="100"></progress>
      </div>
      <div class='upload-tracker__upload-details'>
        ${upload.record.failedFiles.length} files failed to upload
      </div>
    </div>
  `
}