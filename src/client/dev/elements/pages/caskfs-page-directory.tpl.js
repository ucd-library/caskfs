import { html, css } from 'lit';
import '../components/caskfs-directory-controls.js';
import '../components/caskfs-directory-list.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-directory {
      display: block;
    }
    caskfs-page-directory .page-container {
      position: relative;
    }
    caskfs-page-directory .drag-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1000;
      background-color: color-mix(in srgb, var(--ucd-blue-60, #b0d0ed) 80%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    caskfs-page-directory .drag-overlay .drag-message {
      background: white;
      color: var(--ucd-blue, #022851);
      padding: 2rem;
      border-radius: 8px;
      font-size: 1rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      --cork-icon-size: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      font-weight: 700;
    }
    caskfs-page-directory .content {
      display: block;
    }
    caskfs-page-directory caskfs-directory-controls {
      margin-bottom: 1rem;
    }

    @media (min-width: 480px) {
      caskfs-page-directory .content {
        display: flex;
        gap: 1rem;
      }
      caskfs-page-directory .content caskfs-directory-controls {
        width: 55px;
      }
      caskfs-page-directory .spacer {
        border-bottom: none;
        border-right: 2px dotted var(--ucd-gold, #ffbf00);
        height: auto;
        align-self: stretch;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div class="page-container"
    @drop=${this._onDrop}
    @dragover=${this._onDragOver}
    @dragleave=${this._onDragLeave}>
    <div><h1 class="page-title">Directory</h1></div>
    <ol class="breadcrumbs">
      <li><a href="${appUrlUtils.fullLocation()}">Home</a></li>
      <li>Directory</li>
    </ol>
    <div class="l-container u-space-mt--large">
      <div class='content'>
        <caskfs-directory-controls></caskfs-directory-controls>
        <div class='spacer'></div>
        <caskfs-directory-list></caskfs-directory-list>
      </div>
    </div>
    <div class="drag-overlay" ?hidden=${!this.dragging} style="height: ${this.dragZoneHeight}px;">
      <div class="drag-message">
        <cork-icon icon="fas.upload"></cork-icon>
        <div>Drop files here to upload them to this directory.</div>
      </div>
    </div>
  </div>
`;}