import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .subsection {
      margin-bottom: 1.5rem;
    }
    .subsection:last-child {
      margin-bottom: 0;
    }
    .subsection-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px dotted var(--ucd-gold, #ffbf00);
      padding-bottom: .5rem;
      margin-bottom: .5rem;
      --cork-icon-button-size: 1.5rem;
    }
    .subsection-title {
      font-weight: 700;
      color: var(--ucd-blue, #022851);
    }
    .empty-state {
      color: var(--ucd-black-60, #666);
      font-size: .875rem;
      padding: .25rem 0;
    }
    .item-row {
      display: flex;
      align-items: center;
      gap: .25rem;
      padding: .25rem 0;
      --cork-icon-button-size: 1.5rem;
    }
    .item-name-button {
      all: unset;
      display: flex;
      align-items: center;
      gap: .25rem;
      cursor: pointer;
      color: var(--ucd-blue-80, #13639e);
      flex: 1;
      min-width: 0;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .item-name-button:hover, .item-name-button:focus {
      color: var(--tahoe, #00b2e3);
    }
  `;

  return [elementStyles];
}

export function render() {
  return html`
    <caskfs-section-header text='Lineage' icon='fas.diagram-project' brand-color='putah-creek'>
    </caskfs-section-header>

    <div class='subsection'>
      <div class='subsection-header'>
        <div class='subsection-title'>Sources</div>
        <cork-icon-button
          icon='fas.plus'
          basic
          title='Add Source'
          aria-label='Add Source'
          @click=${() => this._onAddClick('source')}>
        </cork-icon-button>
      </div>
      <div class='empty-state' ?hidden=${this.sources.length}>No sources recorded</div>
      <div ?hidden=${!this.sources.length}>
        ${this.sources.map(item => html`
          <div class='item-row'>
            <button type='button' class='item-name-button' @click=${() => this._onItemClick(item)}>
              <cork-icon icon='fas.file'></cork-icon>
              <div>${item.name}</div>
            </button>
            <cork-icon-button
              icon='fas.arrow-up-right-from-square'
              basic
              title='Go To File'
              link-aria-label='Go To File'
              href=${item.link}>
            </cork-icon-button>
          </div>
        `)}
      </div>
    </div>

    <div class='subsection'>
      <div class='subsection-header'>
        <div class='subsection-title'>Derivatives</div>
        <cork-icon-button
          icon='fas.plus'
          basic
          title='Add Derivative'
          aria-label='Add Derivative'
          @click=${() => this._onAddClick('derivative')}>
        </cork-icon-button>
      </div>
      <div class='empty-state' ?hidden=${this.derivatives.length}>No derivatives recorded</div>
      <div ?hidden=${!this.derivatives.length}>
        ${this.derivatives.map(item => html`
          <div class='item-row'>
            <button type='button' class='item-name-button' @click=${() => this._onItemClick(item)}>
              <cork-icon icon='fas.file'></cork-icon>
              <div>${item.name}</div>
            </button>
            <cork-icon-button
              icon='fas.arrow-up-right-from-square'
              basic
              title='Go To File'
              link-aria-label='Go To File'
              href=${item.link}>
            </cork-icon-button>
          </div>
        `)}
      </div>
    </div>
  `;
}
