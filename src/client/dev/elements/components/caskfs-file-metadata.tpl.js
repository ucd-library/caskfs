import { html, css, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import prismStyles from 'prismjs/themes/prism.css';

import panelStyles from '@ucd-lib/theme-sass/4_component/_panel.css.js';

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
    .widget-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .widget-title__main {
      display: flex;
      align-items: center;
      gap: .5rem;
      --cork-icon-size: 1.5rem;
    }
    .widget-title__main cork-icon {
      color: var(--sage)
    }
    .widget-title .panel__title {
      margin: 0;
    }
    .widget-body {
      padding: 0 1rem 1rem 1rem;
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
    @container (min-width: 400px) {
      .metadata-details {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem 2rem;
      }
    }
  `;

  return [
    unsafeCSS(prismStyles),
    panelStyles,
    elementStyles
  ];
}

export function render() { 
return html`

  <div class='widget-title'>
    <div class='widget-title__main'>
      <cork-icon icon='fas.circle-info'></cork-icon>
      <h2 class='panel__title'>File Metadata</h2>
    </div>
    <cork-toggle-switch 
      @cork-toggle-switch-change=${e => this.showRaw = e.detail.selected}
      label="Raw">
    </cork-toggle-switch>
  </div>
  <div class='widget-body'>
    <div ?hidden=${!this.showRaw}><pre><code>${unsafeHTML(this.highlightedData)}</code></pre></div>
    <div ?hidden=${this.showRaw} class='metadata-details'>
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
    </div>
  </div>
`;}