import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }

    [hidden] {
      display: none !important;
    }
    .container {
      display: flex;
      align-items: center;
      gap: var(--app-search-badge-filter-gap, .5rem);
      flex-wrap: wrap;
    }
    .filter {
      all: unset;
      display: flex;
      align-items: center;
      padding: .5rem 1rem .5rem .5rem;
      gap: .5rem;
      background: var(--ucd-blue-50, #CCE0F3);
      border-radius: 5rem;
      cursor: pointer;
    }
    .icon-wrapper {
      color: var(--ucd-blue-80, #13639E);
      background-color: transparent;
      border-radius: 50%;
      width: 1.5rem;
      height: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.3s, color 0.3s;
    }
    .label {
      display: flex;
      align-items: center;
      gap: .25rem;
      flex-wrap: wrap;
      color: var(--ucd-blue-100, #022851);
    }
    .label .filter-label {
      font-size: .75rem;
      font-weight: 400;
    }
    .label .filter-value {
      font-size: .875rem;
      font-weight: 700;
    }
    .filter:hover .icon-wrapper, .filter:focus .icon-wrapper {
      background-color: var(--ucd-blue-80, #13639E);
      color: var(--ucd-gold-100, #FFBF00);
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div role="region" aria-label="Active filters" class='container'>
      ${this.appliedFilters.map(filter => html`
        <button class='filter' @click=${() => this._onFilterClick(filter)} aria-label="Remove filter ${filter.filter.label} with value ${filter.value}">
          <div class='icon-wrapper'>
            <cork-icon icon='fas.xmark'></cork-icon>
          </div>
          <div class='label'>
            <div class='filter-label'>${filter.filter.label}:</div>
            <div class='filter-value'>${filter.value}</div>
          </div>
        </button>
      `)}
    </div>
  `;
}