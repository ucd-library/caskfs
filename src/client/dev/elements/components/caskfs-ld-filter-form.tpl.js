import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';
import { classMap } from 'lit/directives/class-map.js';

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
    .input-container {
      width: 100%;
    }
    input {
      box-sizing: border-box;
    }
    cork-icon-button {
      --cork-icon-button-size: 2rem;
    }
    .filters-container label {
      padding-bottom: 0;
    }
    .single .multiple-add {
      display: none;
    }
    .single .clear-value {
      display: none;
    }

    .multiple-add {
      all: unset;
      cursor: pointer;
      color: var(--ucd-blue-80, #13639E);
      font-size: .875rem;
      text-decoration: underline;
      margin-top: .5rem;
    }
    .multiple-add:hover, .multiple-add:focus {
      color: var(--tahoe, #00b2e3);
    }

    @container (min-width: 450px) {
      form {
        flex-direction: row;
        align-items: flex-start;
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
        align-items: flex-start;
      }
    }
  `;

  return [
    formStyles,
    elementStyles
  ];
}

export function render() { 
  const classes = {
    'multiple': this.multiple,
    'single': !this.multiple
  };
  const filter = this.filters.find(f => f.value === this.filter);
  const values = this.value.split(',');
  return html`
    <form @submit=${this._onFormSubmit} class=${classMap(classes)}>
      <div class="filters-container">
        <label for="ld-filter-select">Filter By:</label>
        <select id="ld-filter-select" name="ld-filter-select" .value=${this.filter} @change=${this._onFilterSelect}>
          <option value="" disabled>Select a filter</option>
          ${this.filters.map(f => html`<option value=${f.value}>${f.label}</option>`)}
        </select>
      </div>
      <div class="value-container">
        <div class="input-container">
          ${values.map((v, i) => html`
            <input
              type="text"
              placeholder=${this.filter ? "Enter filter value" : "Select a filter then enter value"}
              aria-label="Filter value"
              ?disabled=${!this.filter}
              .value=${v}
              @input=${e => this._onValueInput(e.target.value, i)}
            />
          `)}
          <button 
            type="button"
            class="multiple-add">Add Another ${filter?.label || 'Value'}
          </button>
        </div>
        <cork-icon-button
          icon="fas.plus"
          title="Apply Filter"
          link-aria-label="Apply Filter"
          ?disabled=${!this.filter || !this.value}
          @click=${this._onFormSubmit}
        ></cork-icon-button>
      </div>

    </form>
  `;
}