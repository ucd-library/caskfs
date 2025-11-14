import { html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
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
    }
    .suggestion-item {
      all: unset;
      display: flex;
      align-items: center;
      gap: .5rem;
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
    .is-directory cork-icon {
      color: var(--ucd-blue-80, #13639e);
    }
    .is-file cork-icon {
      color: var(--ucd-black-80, #333);
    }
    .more-suggestions {
      font-size: .875rem;
      color: var(--ucd-black-60, #666);
      padding: .5rem;
    }
    .error {
      color: var(--double-decker, #c10230);
      padding: .5rem;
      font-weight: bold;
    }
    .no-suggestions {
      padding: .5rem;
      color: var(--ucd-black-60, #666);
    }
    .suggestions {
      border: 1px solid var(--ucd-black-30);
      overflow-y: auto;
      background-color: var(--ucd-white, #fff);
      position: absolute;
      width: 100%;
      z-index: 10;
      box-sizing: border-box;
    }
  `;

  return [
    formStyles,
    elementStyles
  ];
}

export function render() { 
return html`
  <div @focusout=${this._onElementFocusOut}>
    <input
      id="value-input"
      type="text"
      placeholder="Search for a file..."
      .value=${this.value}
      @input=${this._onValueInput}
      @focus=${this._onValueFocus}
      autocomplete="off"
    />
    <div class="suggestions" ?hidden=${!this.showSuggestions} style=${styleMap(this.suggestionContainerStyles)}>
      <div ?hidden=${!this.fetchError} class="error">Error fetching suggestions</div>
      <div ?hidden=${this.fetchError || !this.suggestions.length} class="suggestion-list">
        <div>
          ${this.suggestions.map(suggestion => html`
            <button
              type="button"
              class="suggestion-item is-${suggestion.isDirectory ? 'directory' : 'file'}"
              @click=${()=> this._onSuggestionClick(suggestion)}>
              <cork-icon icon=${suggestion.isDirectory ? 'fas.folder' : 'fas.file'}></cork-icon>
              <div>${suggestion.name}</div>
            </button>
          `)}
        </div>
        <div ?hidden=${this.totalSuggestions <= this.suggestionLimit} class="more-suggestions">${this.totalSuggestions - this.suggestionLimit} more suggestions available. Please refine your search.</div>
      </div>
      <div ?hidden=${this.fetchError || this.suggestions.length} class="no-suggestions">No suggestions found</div>
    </div>
  </div>


`;}