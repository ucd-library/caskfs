import { html, css } from 'lit';
import headingsStyles from '@ucd-lib/theme-sass/1_base_html/_headings.css.js';
import headingsClasses from '@ucd-lib/theme-sass/2_base_class/_headings.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    .predicate-container {
      margin-bottom: 1.5rem;
      padding: 1rem;
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
      margin-bottom: .5rem;
      word-break: break-all;
      overflow-wrap: anywhere;
      line-break: anywhere;
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
      <caskfs-section-header text="${this.inbound ? 'Inbound' : 'Outbound'} Relationships" icon='fas.${this.inbound ? 'right-to-bracket' : 'right-from-bracket'}' brand-color=${this.brandColor} heading-style='panel'>
      </caskfs-section-header>
      <div>
        ${this.relationships.map(({ predicate, nodes }) => html`
          <div class='predicate-container'>
            <div class='predicate-text'>${predicate.lastSegment}</div>
            <div class='predicate-ns' ?hidden=${!predicate.ns}>${predicate.ns}</div>
            <div>
              ${nodes.map(node => html`
                <div>${node.uri}</div>
                `)}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}