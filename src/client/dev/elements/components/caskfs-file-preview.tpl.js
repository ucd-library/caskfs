import { html, css, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import prismStyles from 'prismjs/themes/prism.css';
import spaceUtils from '@ucd-lib/theme-sass/6_utility/_u-space.css.js';
import './caskfs-av-player.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    pre {
      overflow-x: scroll;
      font-size: .875rem;
      white-space: pre-wrap;
    }
    .loader {
      display: flex;
      align-items: center;
      gap: .5rem;
      font-size: 1rem;
      color: var(--ucd-blue, #022851);
    }
    .loader cork-icon {
      animation: spin 3s linear infinite;
      font-size: 1.5rem;
    }
    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }
    .preview-options {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
  `;

  return [
    unsafeCSS(prismStyles),
    spaceUtils,
    elementStyles
  ];
}

export function render() { 
  return html`
    <div>
      <div ?hidden=${!(this.loading && !this.buttonLoader)} class='loader'>
        <cork-icon icon="fas.spinner"></cork-icon> Loading preview...
      </div>
      <div ?hidden=${!(!this.loading || (this.loading && this.buttonLoader))}>
        ${_renderContents.call(this)}
      </div>
    </div>
  `;
}

function _renderContents(){

  const showPreviewButton = this.exceedsPreviewThreshold && !this.previewAnyway.get(this._filepath);
  const showButtonLoader = this.loading && this.buttonLoader;

  // preview exceeds threshold, show warning and options
  if ( this.previewType === 'image' && showPreviewButton ) {
    return html`
      <div class="exceeds-threshold-warning">
        <p>The file size exceeds the default preview threshold.</p>
        <div class="preview-options">
          <cork-prefixed-icon-button icon="fas.eye" @click=${this._onDisplayAnywayClick}>Show Anyway</cork-prefixed-icon-button>
          ${_renderDownloadButton.call(this)}
        </div>
      </div>
    `
  }

  if ( this.previewType === 'json' ) {
    return html`
      <pre><code class="language-json">${unsafeHTML(this.fileContents)}</code></pre>
      <div class="preview-options">
        <cork-prefixed-icon-button 
          icon="fas.eye" 
          @click=${this._onDisplayAnywayClick}
          text=${showButtonLoader ? 'Loading...' : 'Show All'}
          ?hidden=${!showPreviewButton}>
        </cork-prefixed-icon-button>
        ${_renderDownloadButton.call(this)}
      </div>
    `;
  }

  const showPreviewImage = this.previewType === 'image' && (!this.exceedsPreviewThreshold || this.previewAnyway.get(this._filepath));
  if ( showPreviewImage ) {
    return html`
      <img src=${this.FsModel.fileDownloadUrl(this._filepath)} alt="Preview of image file ${this._filepath}" />
      <div class='u-space-mt'>
        ${_renderDownloadButton.call(this)}
      </div>
      
    `;
  }
  if ( this.previewType === 'video' ) {
    return html`
      <caskfs-av-player src=${this.FsModel.fileDownloadUrl(this._filepath)} video></caskfs-av-player>
      <div class='u-space-mt'>
        ${_renderDownloadButton.call(this)}
      </div>
    `;
  }
  if ( this.previewType === 'audio' ) {
    return html`
      <caskfs-av-player src=${this.FsModel.fileDownloadUrl(this._filepath)}></caskfs-av-player>
      <div class='u-space-mt'>
        ${_renderDownloadButton.call(this)}
      </div>
    `;
  }
  if ( this.previewType === 'text' ) {
    return html`
      <pre><code>${this.fileContents}</code></pre>
      <div class="preview-options">
        <cork-prefixed-icon-button 
          icon="fas.eye" 
          @click=${this._onDisplayAnywayClick}
          text=${showButtonLoader ? 'Loading...' : 'Show All'}
          ?hidden=${!showPreviewButton}>
        </cork-prefixed-icon-button>
        ${_renderDownloadButton.call(this)}
      </div>
    `;
  }
  return html`
    <p>No preview available for this file type.</p>
    ${_renderDownloadButton.call(this)}
  `;
}

function _renderDownloadButton(){
  return html`
    <cork-prefixed-icon-button icon="fas.download" link-download href=${this.FsModel.fileDownloadUrl(this._filepath)}>Download</cork-prefixed-icon-button>
  `;
}