import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    input {
      box-sizing: border-box;
      width: 100%;
    }
    .typeahead-container {
      position: relative;
      width: 100%;
    }
    .suggestions {
      border: 1px solid var(--ucd-black-30);
      overflow-y: auto;
      background-color: var(--ucd-white, #fff);
      box-sizing: border-box;
    }
    .suggestion-item {
      all: unset;
      display: block;
      width: 100%;
      padding: .25rem .5rem;
      cursor: pointer;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
      box-sizing: border-box;
    }
    .suggestion-item:hover, .suggestion-item:focus {
      background-color: var(--ucd-gold-30, #FFF9E6);
      color: inherit;
    }
    .no-suggestions {
      padding: .5rem;
      color: var(--ucd-black-60, #666);
    }
    .error {
      color: var(--double-decker, #c10230);
      padding: .5rem;
      font-weight: bold;
    }
  `;

  return [
    formStyles,
    elementStyles
  ];
}

export function render() {
return html`
  <div class="typeahead-container">
    <input
      id="value-input"
      type="text"
      placeholder=${this.placeholder}
      .value=${this.value}
      @input=${this._onValueInput}
      @focus=${this._onValueFocus}
      autocomplete="off"
    />
    <div class="suggestions" style=${this.ctl.dropdown.styleMap}>
      <div ?hidden=${!this.fetchError} class="error">Error fetching ${this.type === 'user' ? 'users' : 'roles'}</div>
      <div ?hidden=${this.fetchError || this.suggestions.length}>
        <div class="no-suggestions">No ${this.type === 'user' ? 'users' : 'roles'} found</div>
      </div>
      <div ?hidden=${this.fetchError}>
        ${this.suggestions.map(name => html`
          <button
            type="button"
            class="suggestion-item"
            @click=${() => this._onSuggestionClick(name)}>${name}</button>
        `)}
      </div>
    </div>
  </div>
`;}
