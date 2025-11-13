import { html, css, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import prismStyles from 'prismjs/themes/prism.css';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    [hidden] {
      display: none !important;
    }
    .token.operator, .token.entity, .token.url {
      background: none;
    }
    pre {
      overflow-x: scroll;
      font-size: .8rem;
      margin: 0;
    }
    .desktop-view {
      display: none !important;
    }
    @container (min-width: 775px) {
      .mobile-view {
        display: none !important;
      }
      .desktop-view {
        display: block !important;
      }
    }
    .table-header {
      border-bottom: 2px solid var(--ucd-gold-80, #FFD24C);
      font-weight: 700;
      padding: 1rem .5rem;
      box-sizing: border-box;
    }
    .desktop-view .table-header {
      width: 100%;
    }
    .row-grid {
      display: grid;
      gap: .5rem;
      grid-template-columns: minmax(0,1fr) 3rem;
      align-items: stretch;
    }
    .desktop-view .row-grid {
      grid-template-columns: minmax(0, 3fr) minmax(0, 3fr) 4rem 3rem;
    }
    .row {       
      width: 100%;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
      padding: 1rem .5rem;
      box-sizing: border-box;
    }
    .desktop-view .cell {
      word-break: break-all;
    }
    .row:hover {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    .row:focus-within {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    .row.is-selected {
      background-color: var(--ucd-blue-30, #EBF3FA);
    }
    .rule-name {
      font-weight: 700;
      color: var(--ucd-blue, #022851);
    }
    .rule-id {
      font-size: .875rem;
      color: var(--ucd-black-60, #666);
    }
    .field-label {
      font-weight: 700;
      color: var(--ucd-blue, #022851);
      font-size: .875rem;
    }
    .desktop-view .value-func-container {
      margin-top: 1rem;
    }
    .mobile-field {
      margin-bottom: .5rem;
    }
  `;

  return [
    unsafeCSS(prismStyles),
    elementStyles
  ];
}

export function render() { 
  if ( !this.rules.length ) return html``;
  
  return html`
    <div class='desktop-view'>
      <div class='table-header row-grid'>
        <div>Name</div>
        <div>Regex</div>
        <div>Index</div>
        <div></div>
      </div>
      <div>
        ${this.rules.map( rule => html`
          <div class='row'>
            <div class='row-grid'>
              <div class='cell'>
                <div class='rule-name'>${rule.rule.name}</div>
                <div class='rule-id'>${rule.rule.auto_path_partition_id}</div>
              </div>
              <div class='cell'>
                <code ?hidden=${!rule.rule.filter_regex}><pre><code>${unsafeHTML(rule.regexHtml)}</code></pre></code>
                <span ?hidden=${rule.rule.filter_regex}>--</span>
              </div>
              <div class='cell'>${rule.hasIndex ? rule.rule.index : '--'}</div>
              <div ?hidden=${!rule.rule.get_value}>
                <cork-icon-button
                  icon="fas.code"
                  basic
                  title="Toggle Value Function"
                  link-aria-label="Toggle Value Function"
                  @click=${() => this._onValueFuncToggleClick(rule)}
                ></cork-icon-button>
              </div>
            </div>
            <div ?hidden=${!rule.valueFuncDisplayed} class='value-func-container'>
              <div class='field-label'>Custom Value Function</div>
              <pre><code>${unsafeHTML(rule.valueFuncHtml)}</code></pre>
            </div>
          </div>
          `)}
      </div>
    </div>
    <div class='mobile-view'>
      <div class='table-header row-grid'>
        <div>Name</div>
        <div></div>
      </div>
      <div>
        ${this.rules.map( rule => html`
          <div class='row'>
            <div class='row-grid'>
              <div class='cell'>
                <div class='mobile-field'>
                  <div class='rule-name'>${rule.rule.name}</div>
                  <div class='rule-id'>${rule.rule.auto_path_partition_id}</div>
                </div>
                <div class='mobile-field'>
                  <div class='field-label'>Regex</div>
                  <code ?hidden=${!rule.rule.filter_regex}><pre><code>${unsafeHTML(rule.regexHtml)}</code></pre></code>
                  <span ?hidden=${rule.rule.filter_regex}>--</span>
                </div>
                <div class='mobile-field'>
                  <div class='field-label'>Index</div>
                  <div>${rule.hasIndex ? rule.rule.index : '--'}</div>
                </div>
              </div>
              <div class='cell'>
                <div ?hidden=${!rule.rule.get_value}>
                  <cork-icon-button
                    icon="fas.code"
                    basic
                    title="Toggle Value Function"
                    link-aria-label="Toggle Value Function"
                    @click=${() => this._onValueFuncToggleClick(rule)}
                  ></cork-icon-button>
                </div>
              </div>
            </div>
            <div ?hidden=${!rule.valueFuncDisplayed} class='value-func-container'>
              <div class='field-label'>Custom Value Function</div>
              <pre><code>${unsafeHTML(rule.valueFuncHtml)}</code></pre>
            </div>
          </div>
          `)}
      </div>
    </div>
  `;
}