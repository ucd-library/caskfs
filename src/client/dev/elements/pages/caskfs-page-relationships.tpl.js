import { html, css } from 'lit';

import '../components/caskfs-ld-relationships.js';
import '../components/caskfs-fs-typeahead.js';
import '../components/caskfs-ld-filter-form.js';
import '../components/caskfs-ld-filter-buttons.js';

import mimeTypeUtils from '../../utils/mimeTypeUtils.js';
import appUrlUtils from '../../utils/appUrlUtils.js';

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
    caskfs-page-relationships .filter-controls {
      padding: 0 0 2rem;
      border-bottom: 4px dotted var(--ucd-gold, #ffbf00);
      margin-bottom: 2rem;
    }
    caskfs-page-relationships caskfs-fs-typeahead {
      margin-top: 1.5rem;
      max-width: 400px;
      width: 100%;
    }
    caskfs-page-relationships .file-lookup-container {
      display : flex;
      flex-direction : column;
      align-items : center;
      justify-content : center;
    }
    @media (min-width: 768px) {
      caskfs-page-relationships .main-node-container {
        position: sticky;
        top: 80px;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div><h1 class="page-title">Linked Data Relationships</h1></div>
    <ol class="breadcrumbs">
      <li><a href="${appUrlUtils.fullLocation()}">Home</a></li>
      <li>Linked Data Relationships</li>
    </ol>

    <div class="l-container">

      <div class='file-lookup-container' ?hidden=${ !this.ctl.directoryPath.emptyOrRoot }>
        <div>Please select a file to view its linked data relationships</div>
        <caskfs-ld-filter-buttons .filters=${[{value: 'partition', label: 'Partition', multiple: true}]} @caskfs-ld-filter-removed=${this._onPartitionRemoved}></caskfs-ld-filter-buttons>
        <caskfs-fs-typeahead @caskfs-fs-typeahead-select=${this._onFileSelect}></caskfs-fs-typeahead>
      </div>

      <div ?hidden=${ this.ctl.directoryPath.emptyOrRoot }>
        <div class='filter-controls'>
          <caskfs-ld-filter-form .filters=${this.filters}></caskfs-ld-filter-form>
          <caskfs-ld-filter-buttons .filters=${this.filters}></caskfs-ld-filter-buttons>
          <caskfs-ld-filter-buttons .filters=${[{value: 'partition', label: 'Partition', multiple: true}]} @caskfs-ld-filter-removed=${this._onPartitionRemoved}></caskfs-ld-filter-buttons>
        </div>
        <div class="l-3col">
          <div class="l-second">
            <div class="main-node-container">
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
              <a class="btn btn--alt3 u-space-mt--large" href=${appUrlUtils.fullLocation(`/rel`)}>Select New File</a>
            </div>
          </div>
          <div class="l-first">
            <caskfs-ld-relationships inbound hide-filter-controls bidirectional-filtering></caskfs-ld-relationships>
          </div>
          <div class="l-third">
            <caskfs-ld-relationships hide-filter-controls bidirectional-filtering></caskfs-ld-relationships>
          </div>
        </div>
      </div>
    </div>
  `;
}
