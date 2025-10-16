import { html, css } from 'lit';

import '../components/caskfs-file-metadata.js';
import '../components/caskfs-fs-breadcrumbs.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-file-single {
      display: block;
    }
    caskfs-page-file-single caskfs-fs-breadcrumbs {
      margin: 1rem 1rem 1.75rem 1rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <caskfs-fs-breadcrumbs></caskfs-fs-breadcrumbs>
  <div class='l-container u-space-mt--large'>
    <div class="l-basic--flipped">
      <div class="l-content">
        <caskfs-file-metadata></caskfs-file-metadata>
      </div>
      <div class="l-sidebar-second">
        <button class="btn btn--alt3 btn--block u-space-mb" @click=${this._onDeleteRequest}>Delete File</button>
        <a class="btn btn--alt3 btn--block" href=${this.FsModel.fileDownloadUrl(this.directoryPathCtl.pathname)} download>Download File</a>
      </div>
    </div>
  </div>
`;}