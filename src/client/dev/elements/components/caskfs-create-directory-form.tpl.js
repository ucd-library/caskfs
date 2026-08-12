import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';

import IdGenerator from '../../utils/IdGenerator.js';
const idGen = new IdGenerator();

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    input {
      box-sizing: border-box;
      width: 100%;
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
    .parent-directory {
      margin-bottom: 1.25rem;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .error-message {
      color: var(--double-decker, #c10230);
      font-size: .875rem;
      margin-top: .25rem;
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
      <div class='parent-directory'>
        Creating folder in <strong>${this.parentDirectory}</strong>
      </div>
      <div class='field-container'>
        <label class='field-label' for=${idGen.get('folder-name')}>Folder Name</label>
        <input
          id=${idGen.get('folder-name')}
          name=${idGen.get('folder-name')}
          type="text"
          .value=${this.name}
          placeholder="e.g. reports"
          @input=${this._onNameInput}
        />
        <div ?hidden=${!this.errorMessage} class='error-message'>${this.errorMessage}</div>
      </div>
    </form>
  `;
}
