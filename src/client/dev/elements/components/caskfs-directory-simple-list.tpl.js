import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-directory-simple-list {
      display: block;
    }
    caskfs-directory-simple-list .contents {
      position: relative;
    }
    caskfs-directory-simple-list .has-subdir-content .empty-state {
      display: none;
    }
    caskfs-directory-simple-list .no-subdir-content .subdir-contents {
      display: none;
    }
    caskfs-directory-simple-list .subdir-contents {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      padding: .5rem 1rem 1rem 0;
      min-height: 100px;
    }
    caskfs-directory-simple-list .empty-state {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      padding: .5rem 1rem 1rem 0;
    }
    caskfs-directory-simple-list .dragging .drag-hint {
      font-weight: 700;
      color: var(--ucd-blue, #022851);
    }
    caskfs-directory-simple-list .widget-header {
      border-bottom: 3px dotted var(--ucd-gold, #ffbf00);
      padding-bottom: .5rem;
    }
    caskfs-directory-simple-list .drag-overlay {
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1000;
      background-color: color-mix(in srgb, var(--ucd-blue-60, #b0d0ed) 80%, transparent);
      align-items: center;
      justify-content: center;
    }
    caskfs-directory-simple-list .dragging.has-subdir-content .drag-overlay {
      display: flex;
    }
    caskfs-directory-simple-list .drag-overlay .drag-message {
      background: white;
      color: var(--ucd-blue, #022851);
      padding: 1rem;
      border-radius: 8px;
      font-size: .875rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      --cork-icon-size: 1rem;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: .25rem;
    }
    caskfs-directory-simple-list .name-link {
      text-decoration: none;
      display: flex;
      gap: .5rem;
      font-weight: 700;
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-directory-simple-list .name-link:visited {
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-directory-simple-list .name-link:hover, caskfs-directory-simple-list .name-link:focus {
      color: var(--tahoe, #00b2e3);
    }
    caskfs-directory-simple-list .name-link cork-icon {
      margin-top: .25rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
  <div class="container ${this.ctl.directoryList.contents.length ? 'has-subdir-content' : 'no-subdir-content'} ${this.dragging ? 'dragging' : ''}">
    <h2 class='heading--highlight widget-header'>File Subdirectory</h2>
    <div class='contents' @dragover=${this._onDragOver} @dragleave=${this._onDragLeave} @drop=${this._onDrop}>
      <div class='empty-state'>
        <div>This file does not have an associated subdirectory.</div>
        <div class='drag-hint'>Drag and drop files here to create one.</div>
      </div>
      <div class='subdir-contents'>
        ${this.ctl.directoryList.contents.map( item => html`
          <div>
            <a class='name-link' href=${item.link}>
              <cork-icon icon=${item.isDirectory ? 'fas.folder' : 'fas.file'} class='type-icon'></cork-icon>
              <div class='name-text'>${item.name}</div>
            </a>
          </div>
          `)}
      </div>
      <div class="drag-overlay" style="height: ${this.dragZoneHeight}px;padding-top: ${this.dragZonePaddingTop}px;">
        <div class="drag-message">
          <cork-icon icon="fas.upload"></cork-icon>
          <div>Drop files here to upload them to this subdirectory.</div>
        </div>
      </div>
    </div>
  </div>
  `;
}