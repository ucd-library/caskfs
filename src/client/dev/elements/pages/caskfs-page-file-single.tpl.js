import { html, css } from 'lit';

import appUrlUtils from '../../utils/appUrlUtils.js';
import mimeTypeUtils from '../../utils/mimeTypeUtils.js';

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
        <caskfs-file-metadata class='u-space-mb--large'></caskfs-file-metadata>
        <div>
          <caskfs-section-header text='Linked Data' icon='fas.diagram-project' brand-color='putah-creek'>
            <div slot='actions'>
              <cork-icon-button
                icon="fas.arrow-up-right-from-square"
                basic
                title="View Linked Data Relationships"
                link-aria-label="View Linked Data Relationships"
                href=${appUrlUtils.fullPath(`/rel${this.ctl.directoryPath.pathname}`)}
              ></cork-icon-button>
            </div>
          </caskfs-section-header>
          <p>TODO: I think a very basic summary here would be useful. Like a total count of all inbound/outbound links, so the user knows if the link is even worth following. - SP</p>
        </div>
      </div>
      <div class="l-sidebar-second">
        <button class="btn btn--alt3 btn--block u-space-mb" @click=${this._onDeleteRequest}>Delete File</button>
        <a class="btn btn--alt3 btn--block u-space-mb" href=${this.FsModel.fileDownloadUrl(this.ctl.directoryPath.pathname)} download>Download File</a>
        <button class="btn btn--alt3 btn--block u-space-mb" @click=${this._onDisplayFileClick} ?hidden=${!mimeTypeUtils.previewType(this.data?.metadata?.mimeType)}>Display File</button>
        <button class="btn btn--alt3 btn--block" @click=${this._onCopyPathClick}>Copy File System Path</button>
      </div>
    </div>
  </div>
`;}