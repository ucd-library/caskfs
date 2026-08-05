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
    input, textarea {
      box-sizing: border-box;
      width: 100%;
    }
    textarea {
      min-height: 5rem;
      font-family: inherit;
    }
    .field-container {
      margin-bottom: 1.25rem;
    }
    .field-label {
      font-size: .875rem;
      font-weight: 700;
      color: var(--ucd-black-70, #4c4c4c);
      margin-bottom: .25rem;
    }
    .selected-file {
      display: flex;
      align-items: center;
      gap: .5rem;
      margin-top: .5rem;
      padding: .5rem;
      background-color: var(--ucd-gold-30, #FFF9E6);
      border-radius: .5rem;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
  `;

  return [
    formStyles,
    elementStyles
  ];
}

export function render() {
  return html`
    <form @submit=${this._onSubmit}>
      <div class='field-container'>
        <div class='field-label'>
          ${this.direction === 'derivative' ? 'This file is a source for' : 'This file was derived from'}
        </div>
        <caskfs-fs-typeahead
          placeholder='Search for a file...'
          @caskfs-fs-typeahead-select=${this._onTypeaheadSelect}>
        </caskfs-fs-typeahead>
        <div class='selected-file' ?hidden=${!this.selectedSuggestion}>
          <cork-icon icon='fas.file'></cork-icon>
          <div>${this.selectedSuggestion?.metadata?.filepath}</div>
        </div>
      </div>
      <div class='field-container'>
        <div class='field-label'>Metadata (optional)</div>
        <textarea
          .value=${this.metadataText}
          placeholder='e.g. job or run id, notes...'
          @input=${this._onMetadataInput}>
        </textarea>
      </div>
    </form>
  `;
}
