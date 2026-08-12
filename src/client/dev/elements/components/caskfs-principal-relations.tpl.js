import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';
import buttonStyles from '@ucd-lib/theme-sass/2_base_class/_buttons.css.js';
import '@ucd-lib/theme-elements/brand/ucd-theme-pagination/ucd-theme-pagination.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .back-link {
      background: none;
      border: none;
      color: var(--ucd-blue, #022851);
      cursor: pointer;
      font-weight: bold;
      padding: 0;
      margin-bottom: 1rem;
    }
    .back-link:hover {
      text-decoration: underline;
    }
    .search-row {
      margin-bottom: 1rem;
    }
    .principal-rows {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .principal-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .3rem 0;
      border-bottom: 1px solid var(--ucd-black-20, #e5e5e5);
    }
    .principal-row .principal-name {
      flex: 1;
    }
    .no-contents {
      color: var(--ucd-black-60, #666);
      padding: .5rem 0;
    }
    .add-form {
      display: flex;
      align-items: center;
      gap: .5rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--ucd-black-20, #e5e5e5);
    }
    .add-form caskfs-principal-typeahead {
      flex: 1;
      max-width: 20rem;
    }
  `;

  return [
    formStyles,
    buttonStyles,
    elementStyles
  ];
}

export function render() {
  const relatedLabel = this.relatedType === 'user' ? 'user' : 'role';

  return html`
    <button class="back-link" @click=${this._onBack}>&larr; Back to ${this.scopeType === 'role' ? 'Roles' : 'Users'}</button>
    <h2>${this.heading}</h2>

    <div class="search-row">
      <input
        type="text"
        placeholder="Search ${relatedLabel}s..."
        .value=${this.search}
        @input=${this._onSearchInput}
      />
    </div>

    <div ?hidden=${!this.items.length}>
      <ul class="principal-rows">
        ${this.items.map(relatedName => html`
          <li class="principal-row">
            <div class="principal-name">${relatedName}</div>
            <cork-icon-button
              icon="fas.xmark"
              title="Remove ${relatedName}"
              link-aria-label="Remove ${relatedName}"
              @click=${() => this._onRemoveClick(relatedName)}>
            </cork-icon-button>
          </li>
        `)}
      </ul>
      <ucd-theme-pagination
        current-page=${this.page}
        max-pages=${this.maxPages}
        ellipses
        xs-screen
        @page-change=${this._onPageChange}
      ></ucd-theme-pagination>
    </div>

    <div ?hidden=${this.items.length || this.loading} class="no-contents">
      No ${relatedLabel}s found${this.search ? ` matching "${this.search}"` : ''}.
    </div>

    <div class="add-form">
      <caskfs-principal-typeahead
        .type=${this.relatedType}
        .value=${this.addValue}
        placeholder="Add ${relatedLabel}..."
        @caskfs-principal-typeahead-input=${this._onAddInput}
        @caskfs-principal-typeahead-select=${this._onAddSelect}>
      </caskfs-principal-typeahead>
      <button class="btn btn--alt3" @click=${this._onAddClick} ?disabled=${!this.addValue.trim()}>Add</button>
    </div>
  `;
}
