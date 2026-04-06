import { html, css } from 'lit';

import appUrlUtils from '../../utils/appUrlUtils.js';
import mimeTypeUtils from '../../utils/mimeTypeUtils.js';

import '../components/caskfs-file-metadata.js';
import '../components/caskfs-fs-breadcrumbs.js';
import '../components/caskfs-directory-simple-list.js';
import '../components/caskfs-file-preview.js';

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
        <caskfs-file-metadata class='u-space-mb--large'></caskfs-file-metadata>
        <div>
          <caskfs-section-header text='File Contents' icon='fas.file' brand-color='putah-creek'>
          </caskfs-section-header>
          <caskfs-file-preview></caskfs-file-preview>
        </div>
      </div>
      <div class="l-sidebar-second">
        <button class="btn btn--alt3 btn--block u-space-mb" @click=${this._onDeleteRequest}>Delete File</button>
        <a class="btn btn--alt3 btn--block u-space-mb" href=${this.FsModel.fileDownloadUrl(this.ctl.directoryPath.pathname)} download>Download File</a>
        <button class="btn btn--alt3 btn--block u-space-mb" @click=${this._onCopyPathClick}>Copy File System Path</button>
        <div class="u-space-mb u-space-mt--large">
          <caskfs-directory-simple-list></caskfs-directory-simple-list>
        </div>
      </div>
    </div>
  </div>
`;}