import { html, css } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

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
    caskfs-directory-simple-list .no-subdir-content .subdir-contents-container {
      display: none;
    }
    caskfs-directory-simple-list .subdir-contents-container {
      min-height: 50px;
    }
    caskfs-directory-simple-list .subdir-contents {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      padding: .5rem 1rem 1rem 0;
    }
    caskfs-directory-simple-list .multiple-pages .subdir-contents {
      padding: .5rem 1rem 0 0;
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
      color: var(--ucd-blue, #022851);
      padding: 1rem;
      font-size: .875rem;
      --cork-icon-size: 1.5rem;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: .25rem;
    }
    caskfs-directory-simple-list .name-link {
      text-decoration: none;
      display: flex;
      gap: .25rem;
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-directory-simple-list .name-link.is-current-file {
      font-weight: 700;
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
  const classes = {
    dragging: this.dragging,
    'has-subdir-content': this.ctl.directoryList.contents.length,
    'no-subdir-content': !this.ctl.directoryList.contents.length,
    'multiple-pages': this.ctl.directoryList.totalPages > 1
  };
  return html`
  <div class="container ${classMap(classes)}">
    <h2 class='heading--highlight widget-header'>${this.hasParentFile ? 'Parent File' : 'File'} Subdirectory</h2>
    <div class='contents' @dragover=${this._onDragOver} @dragleave=${this._onDragLeave} @drop=${this._onDrop}>
      <div class='empty-state'>
        <div>This file does not have an associated subdirectory.</div>
        <div class='drag-hint'>Drag and drop files here to create one.</div>
      </div>
      <div class='subdir-contents-container'>
        <div class='subdir-contents'>
          ${this.ctl.directoryList.contents.map( item => html`
            <div>
              <a class='name-link ${item?.metadata?.filepath === this.ctl.directoryPath.pathname ? 'is-current-file' : ''}' href=${item.link}>
                <cork-icon icon=${item.isDirectory ? 'fas.folder' : 'fas.file'} class='type-icon'></cork-icon>
                <div class='name-text'>${item.name}</div>
              </a>
            </div>
          `)}
        </div>
        <ucd-theme-pagination
          ?hidden=${this.ctl.directoryList.totalPages <= 1}
          current-page=${this.ctl.qs.query.page || 1}
          max-pages=${this.ctl.directoryList.totalPages}
          ellipses
          xs-screen
          @page-change=${this._onPageChange}
        ></ucd-theme-pagination>
        <div ?hidden=${!this.hasParentFile}>
          <div class='ucd-link-list-item category-brand--secondary'>
            <cork-icon icon='fas.circle-chevron-right' class='ucd-link-list-item--icon'></cork-icon>
            <div>
              <a class='ucd-link-list-item--title' href=${this.parentFile?.link}>Parent File</a>
              <div class='ucd-link-list-item--excerpt'>${this.parentFile?.name}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="drag-overlay" style="height: ${this.dragZoneHeight}px;padding-top: ${this.dragZonePaddingTop}px;">
        <div class="drag-message">
          <cork-icon icon="fas.upload"></cork-icon>
        </div>
      </div>
    </div>
  </div>
  `;
}