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
    .search-row {
      display: flex;
      gap: .5rem;
      margin-bottom: 1rem;
      align-items: center;
    }
    .search-row input {
      flex: 1;
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
    .row-name {
      flex: 1;
      text-align: left;
      background: none;
      border: none;
      font-weight: bold;
      color: var(--ucd-blue, #022851);
      cursor: pointer;
      padding: .25rem 0;
    }
    .row-name:hover {
      text-decoration: underline;
    }
    .no-contents {
      color: var(--ucd-black-60, #666);
      padding: .5rem 0;
    }
  `;

  return [
    formStyles,
    buttonStyles,
    elementStyles
  ];
}

export function render() {
  const label = this.type === 'user' ? 'user' : 'role';

  return html`
    <div class="search-row">
      <input
        type="text"
        placeholder="Search or add a new ${label}..."
        .value=${this.search}
        @input=${this._onSearchInput}
      />
      <button class="btn btn--alt3" @click=${this._onAddClick} ?disabled=${!this.search.trim()}>Add</button>
    </div>

    <div ?hidden=${!this.items.length}>
      <ul class="principal-rows">
        ${this.items.map(name => html`
          <li class="principal-row">
            <button class="row-name" @click=${() => this._onRowClick(name)}>${name}</button>
            <cork-icon-button
              icon="fas.xmark"
              title="Delete ${label} ${name}"
              link-aria-label="Delete ${label} ${name}"
              @click=${() => this._onDeleteClick(name)}>
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
      No ${label}s found${this.search ? ` matching "${this.search}"` : ''}.
    </div>
  `;
}
