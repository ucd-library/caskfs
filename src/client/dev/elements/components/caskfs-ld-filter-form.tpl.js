import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      max-width: 600px;
      container-type: inline-size;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .filters-container {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .value-container {
      display: flex;
      gap: .5rem;
    }
    .value-container input[type="text"] {
      flex: 1;
    }
    input {
      box-sizing: border-box;
    }

    @container (min-width: 400px) {
      form {
        flex-direction: row;
        align-items: center;
      }
      .filters-container {
        flex-direction: row;
        align-items: center;
      }
      .filters-container label {
        white-space: nowrap;
      }
      .value-container {
        flex: 1;
        align-items: center;
      }
    }
  `;

  return [
    formStyles,
    elementStyles
  ];
}

export function render() { 
return html`
  <form @submit=${this._onFormSubmit}>
    <div class="filters-container">
      <label for="ld-filter-select">Filter By:</label>
      <select id="ld-filter-select" name="ld-filter-select" .value=${this.filter} @change=${this._onFilterSelect}>
        <option value="" disabled>Select a filter</option>
        ${this.filters.map(f => html`<option value=${f.value}>${f.label}</option>`)}
      </select>
    </div>
    <div class="value-container">
      <input
        type="text"
        id="ld-filter-value"
        placeholder="Enter filter value"
        aria-label="Filter value"
        ?disabled=${!this.filter}
        .value=${this.value}
        @input=${e => this.value = e.target.value}
      />
      <cork-icon-button
        icon="fas.plus"
        title="Apply Filter"
        link-aria-label="Apply Filter"
        ?disabled=${!this.filter || !this.value}
        @click=${this._onFormSubmit}
      ></cork-icon-button>
    </div>

  </form>
`;}