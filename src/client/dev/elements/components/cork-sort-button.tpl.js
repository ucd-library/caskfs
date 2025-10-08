import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .dropdown {
      position: absolute;
      border: 1px solid var(--ucd-black-30, #CCC);
      background: var(--white, #FFF);
      z-index: 10;
      padding: 0;
      min-width: 200px;
      color: var(--ucd-blue-80, #13639E);
    }
    .option-button {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      padding: .5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: .5rem;
      cursor: pointer;
    }
    .option-button:hover, .option-button:focus {
      background: var(--ucd-blue-80, #13639e);
      color: var(--white, #FFF);
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div>
    <cork-icon-button
      icon="fas.sort"
      title="Sort"
      @click=${ this._onMainButtonClick }
      link-aria-label="Sort">
    </cork-icon-button>
    <div class="dropdown" ?hidden=${!this.open}>
      ${ this._options.map( option => html`
        <button
          class="option-button"
          @click=${() => this._onOptionClick(option)}>
          <span>${option.label}</span>
          <cork-icon ?hidden=${this.value !== option.value} icon="fas.caret-${this.valueDesc ? 'down' : 'up'}"></cork-icon>
        </button>
        `)}
    </div>
  </div>
`;}