import { html, css, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import prismStyles from 'prismjs/themes/prism.css';

import './caskfs-partition-toggle.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    .token.operator, .token.entity, .token.url {
      background: none;
    }
    pre {
      overflow-x: scroll;
      font-size: .875rem;
    }
    .prop-label {
      font-weight: 700;
      color: var(--ucd-blue, #022851);
    }
    .date-container {
      display: flex;
      flex-wrap: wrap;
      gap: .25rem;
    }
    .date-container > div {
      white-space: nowrap;
    }
    .metadata-details {
      display: grid;
      grid-template-columns: repeat(1, minmax(0, 1fr));
      gap: 1rem 2rem;
    }
    @container (min-width: 400px) {
      .metadata-details {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @container (min-width: 700px) {
      .metadata-details {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `;

  return [
    unsafeCSS(prismStyles),
    elementStyles
  ];
}

export function render() { 
return html`
  <caskfs-section-header text='File Metadata' icon='fas.circle-info' brand-color='sage'>
    <div slot='actions'>
      <cork-toggle-switch 
        @cork-toggle-switch-change=${e => this.showRaw = e.detail.selected}
        label="JSON">
      </cork-toggle-switch>
    </div>
  </caskfs-section-header>
  <div>
    <div ?hidden=${!this.showRaw}><pre><code>${unsafeHTML(this.highlightedData)}</code></pre></div>
    <div ?hidden=${this.showRaw}>
      <div class='metadata-details'>
        <div>
          <div class='prop-label'>Name</div>
          <div>${this.fsUtils.name}</div>
        </div>
        <div>
          <div class='prop-label'>Directory</div>
          <div>${this.data?.directory || '--'}</div>
        </div>
        <div>
          <div class='prop-label'>Kind</div>
          <div>${this.fsUtils.kind}</div>
        </div>
        <div>
          <div class='prop-label'>Size</div>
          <div>${this.fsUtils.size}</div>
        </div>
        <div>
          <div class='prop-label'>Modified</div>
          <div class='date-container'>
            <div>${this.fsUtils.modifiedDate}</div>
            <div>${this.fsUtils.modifiedTime}</div>
          </div>
        </div>
        <div>
          <div class='prop-label'>Modified By</div>
          <div>${this.fsUtils.modifiedBy}</div>
        </div>
        <div>
          <div class='prop-label'>Partitions</div>
          <div>
            <caskfs-partition-toggle .partitions=${this.data?.partition_keys || []}></caskfs-partition-toggle>
            <div ?hidden=${(this.data?.partition_keys || []).length}>--</div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;}