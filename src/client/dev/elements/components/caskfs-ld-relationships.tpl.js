import { html, css } from 'lit';
import headingsStyles from '@ucd-lib/theme-sass/1_base_html/_headings.css.js';
import headingsClasses from '@ucd-lib/theme-sass/2_base_class/_headings.css.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    .predicate-container {
      margin-bottom: 1.5rem;
      padding: 1rem 0;
      background-color: #f0f0f0;
      border-radius: 1rem;
    }
    .predicate-text {
      word-break: break-all;
      overflow-wrap: anywhere;
      line-break: anywhere;
      font-weight: 700;
      color: var(--ucd-blue-100, #022851);
    }
    .predicate-ns {
      font-size: .875rem;
      color: var(--ucd-black-60, #666);
      word-break: break-all;
      overflow-wrap: anywhere;
      line-break: anywhere;
    }
    .predicate-details {
      padding: 0 1rem 1rem;
      border-bottom: 2px dotted var(--ucd-gold, #ffbf00);
    }
    .predicate-actions {
      display: flex;
      align-items: center;
      gap: .25rem;
      margin-top: .25rem;
      --cork-icon-button-size: 1.5rem;
    }
    .node-container {
      padding: .5rem 1rem;
      display: flex;
      align-items: flex-start;
      gap: .5rem;
    }
    .node-container:hover, .node-container:focus-within {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    .node-text {
      word-break: break-all;
      overflow-wrap: anywhere;
      line-break: anywhere;
      color: var(--ucd-blue-100, #022851);
    }
    .node-icon {
      color: var(--ucd-blue-100, #022851);
      margin-top: .25rem;
    }
    .node-ns {
      font-size: .875rem;
      color: var(--ucd-black-60, #666);
      word-break: break-all;
      overflow-wrap: anywhere;
      line-break: anywhere;
    }
    .node-actions {
      display: flex;
      align-items: center;
      gap: .25rem;
      margin-top: .25rem;
      --cork-icon-button-size: 1.5rem;
    }
    caskfs-ld-filter-buttons {
      margin-bottom: 2rem;
    }
    caskfs-ld-filter-buttons[has-filters] {
      margin-top: 1rem;
    }
  `;

  return [
    headingsStyles,
    headingsClasses,
    elementStyles
  ];
}

export function render() { 
  return html`
    <div>
      <caskfs-section-header 
        text="${this.inbound ? 'Inbound' : 'Outbound'} Relationships" 
        icon='fas.${this.inbound ? 'right-to-bracket' : 'right-from-bracket'}' 
        brand-color=${this.brandColor} 
        hide-separator
        heading-style='panel'>
      </caskfs-section-header>
      <caskfs-ld-filter-form .filters=${this.filters}></caskfs-ld-filter-form>
      <caskfs-ld-filter-buttons .filters=${this.filters}></caskfs-ld-filter-buttons>
      <div ?hidden=${this.relationships.length}>
        <div>No relationships found</div>
      </div>
      <div ?hidden=${!this.relationships.length}>
        ${this.relationships.map(({ predicate, nodes }) => html`
          <div class='predicate-container'>
            <div class='predicate-details'>
              <div class='predicate-text'>${predicate.lastSegment}</div>
              <div class='predicate-ns' ?hidden=${!predicate.ns}>${predicate.ns}</div>
              <div class='predicate-actions'>
                <cork-icon-button
                  icon="fas.copy"
                  color="medium"
                  title="Copy Predicate to Clipboard"
                  aria-label="Copy Predicate to Clipboard"
                  @click=${() => this._onCopyPredicateClick(predicate)}
                ></cork-icon-button>
            </div>
            </div>

            <div>
              ${nodes.map(node => html`
                <div class='node-container'>
                    <cork-icon icon='fas.file' class='node-icon'></cork-icon>
                    <div>
                      <div class='node-text'>${node.lastSegment}</div>
                      <div class='node-ns' ?hidden=${!node.ns}>${node.ns}</div>
                      <div class='node-actions'>
                        <cork-icon-button
                          icon="fas.arrows-to-circle"
                          color="medium"
                          title="View Linked Data Relationships"
                          link-aria-label="View Linked Data Relationships"
                          href=${appUrlUtils.fullLocation(`/rel${node.uri}`)}
                        ></cork-icon-button>
                        <cork-icon-button
                          icon="fas.folder"
                          color="medium"
                          title="Go To Directory"
                          link-aria-label="Go To Directory"
                          href=${appUrlUtils.fullLocation(`/directory${node.ns}`)}
                        ></cork-icon-button>
                        <cork-icon-button
                          icon="fas.file-import"
                          color="medium"
                          title="Go To File"
                          link-aria-label="Go To File"
                          href=${appUrlUtils.fullLocation(`/file${node.uri}`)}
                        ></cork-icon-button>
                        <cork-icon-button
                          icon="fas.copy"
                          color="medium"
                          title="Copy File Path to Clipboard"
                          aria-label="Copy File Path to Clipboard"
                          @click=${() => this._onCopyFilePathClick(node)}
                        ></cork-icon-button>
                      </div>
                    </div>
                </div>
                `)}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}