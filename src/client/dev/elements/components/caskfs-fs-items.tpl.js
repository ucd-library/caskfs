import { html, css } from 'lit';
import './caskfs-fs-item.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    .desktop-view {
      display: none !important;
    }
    @container (min-width: 775px) {
      .mobile-view {
        display: none !important;
      }
      .desktop-view {
        display: block !important;
      }
    }
    .table-header {
      border-bottom: 2px solid var(--ucd-gold-80, #FFD24C);
      font-weight: 700;
      padding: 1rem .5rem;
      box-sizing: border-box;
    }
    .desktop-view .table-header {
      
      width: 100%;
    }
    .row-grid {
      display: grid;
      gap: .5rem;
      grid-template-columns: 1fr 30px;
    }
    .view--full .desktop-view .row-grid {
      grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr) 30px;
    }
    .view--simple .desktop-view .row-grid {
      grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr) 30px;
    }
    .table-header .name-container {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .table-header .name-container input[type="checkbox"] {
      margin: 0;
    }

    .field--size {
      display: none;
    }
    .view--full .field--size {
      display: block;
    }

    caskfs-fs-item .item-line {
      display: grid;
      align-items: stretch;
      width: 100%;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
      padding: 1rem .5rem;
      box-sizing: border-box;
    }
    caskfs-fs-item .desktop-view .item-cell {
      word-break: break-all;
    }
    caskfs-fs-item .desktop-view .name-text {
      word-break: break-all;
    }
    caskfs-fs-item .item-line:hover {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    caskfs-fs-item .item-line:focus-within {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    caskfs-fs-item .is-selected .item-line {
      background-color: var(--ucd-blue-30, #EBF3FA);
    }
      
    caskfs-fs-item .is-directory .type-icon {
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-fs-item .is-file .type-icon {
      color: var(--ucd-black-80, #333);
    }
    caskfs-fs-item .name-link {
      text-decoration: none;
      display: flex;
      gap: .5rem;
      font-weight: 700;
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-fs-item .name-link:visited {
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-fs-item .name-link:hover, caskfs-fs-item .name-link:focus {
      color: var(--tahoe, #00b2e3);
    }
    caskfs-fs-item .name-link cork-icon {
      margin-top: .25rem;
    }

    caskfs-fs-item .delete-icon {
      --cork-icon-button-size: 1.25rem;
      margin-top: 2px;
    }
    caskfs-fs-item .date-container {
      display: flex;
      flex-wrap: wrap;
      gap: .25rem;
    }
    caskfs-fs-item .date-container > div {
      white-space: nowrap;
    }
    caskfs-fs-item .name-container {
      display: flex;
      align-items: flex-start;
      gap: .5rem;
    }
    caskfs-fs-item .name-container input[type='checkbox'] {
      margin: .4rem 0 0 0
    }
    caskfs-fs-item .hide-type-icon .name-container cork-icon {
      display: none;
    }
    caskfs-fs-item .details {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      font-size: var(--font-size--small, .75rem);
      margin-top: .75rem;
    }
    caskfs-fs-item .select-visible .details {
      margin-left: 1.25rem;
    }

    caskfs-fs-item .directory-link {
      display: inline-block;
      font-size: var(--font-size--small, .75rem);
      word-break: break-all;
      color: var(--ucd-blue-80, #13639e);
      text-decoration: none;
    }
    caskfs-fs-item .directory-link:visited {
      color: var(--ucd-blue-80, #13639e);
    }
    caskfs-fs-item .directory-link:hover,
    caskfs-fs-item .directory-link:focus {
      color: var(--tahoe, #00b2e3);
    }

    caskfs-fs-item .show-type-icon .directory-link {
      margin-left: 1.5rem;
    }

    @container (min-width: 400px) {
      caskfs-fs-item .details {
        max-width: 500px;
        flex-wrap: wrap;
        flex-direction: row;
        justify-content: space-between;
      }

    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div class='view--${this.view}'>
    <div class='desktop-view'>
      <div class='table-header row-grid'>
        ${renderNameHeader.call(this)}
        <div>Kind</div>
        <div class='field--size'>Size</div>
        <div>Modified</div>
        <div>Modified By</div>
        <div></div>
      </div>
    </div>
    <div class='mobile-view'>
      <div class='table-header row-grid'>
        ${renderNameHeader.call(this)}
      </div>
    </div>

    <div>
      ${this.items.map(item => html`
        <caskfs-fs-item 
          .showDirectoryLink=${this.showDirectoryLink}
          .hideTypeIcon=${this.hideTypeIcon}
          .data=${item}>
        </caskfs-fs-item>
      `)}
    </div>
  </div>
`;}

function renderNameHeader(){
  return html`
    <div class='name-container'>
      <input type="checkbox" 
        @click=${() => this.ctl.select.toggleAll()} 
        .checked=${this.ctl.select.allSelected}>
      <div>Name</div>
    </div>
  `
}