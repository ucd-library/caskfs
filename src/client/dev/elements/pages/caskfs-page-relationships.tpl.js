import { html, css } from 'lit';

import '../components/caskfs-ld-relationships.js';
import mimeTypeUtils from '../../utils/mimeTypeUtils.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-relationships {
      display: block;
    }

    caskfs-page-relationships .directory {
      font-size: .875rem;
      color: var(--ucd-black-60, #666);
      word-break: break-all;
      overflow-wrap: anywhere;
      line-break: anywhere;
    }

    caskfs-page-relationships .actions {
      display: flex;
      align-items: center;
      gap: .25rem;
      margin-top: .25rem;
      --cork-icon-button-size: 1.5rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div class="l-container u-space-mt--large">
      <div class="l-3col">
        <div class="l-second">
          <div>
            <h2 class="filename heading--highlight">${this.metadata?.filename}</h2>
            <div class="directory">${this.metadata?.directory}</div>
            <div class="actions u-space-mt--small">
              <cork-icon-button
                icon="fas.folder"
                color="medium"
                title="Go To Directory"
                link-aria-label="Go To Directory"
                @click=${() => this.ctl.directoryPath.moveUp()}
              ></cork-icon-button>
              <cork-icon-button
                icon="fas.file-import"
                color="medium"
                title="Go To File"
                link-aria-label="Go To File"
                href=${this.ctl.directoryPath.fileLocation()}
              ></cork-icon-button>
              <cork-icon-button
                icon="fas.copy"
                color="medium"
                title="Copy File Path to Clipboard"
                aria-label="Copy File Path to Clipboard"
                @click=${this._onCopyPathClick}
              ></cork-icon-button>
              <cork-icon-button
                icon="fas.eye"
                color="medium"
                title="Display File"
                aria-label="Display File"
                @click=${this._onDisplayFileClick}
                ?hidden=${!mimeTypeUtils.previewType(this.metadata?.metadata?.mimeType)}
              ></cork-icon-button>
            </div>
          </div>
        </div>
        <div class="l-first">
          <caskfs-ld-relationships inbound></caskfs-ld-relationships>
        </div>
        <div class="l-third">
          <caskfs-ld-relationships></caskfs-ld-relationships>
        </div>
      </div>
    </div>
  `;}