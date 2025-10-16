import { html, css } from 'lit';
import './caskfs-directory-item.js';
import './caskfs-fs-breadcrumbs.js';

export function styles() {
  const elementStyles = css`
    caskfs-directory-list {
      display: block;
      width: 100%;
      container-type: inline-size;
    }
    caskfs-directory-list caskfs-fs-breadcrumbs {
      margin: .5rem 0;
    }
    caskfs-directory-list .table-header {
      border-bottom: 2px solid var(--ucd-gold-80, #FFD24C);
      font-weight: 700;
      padding: 1rem .5rem;
    }
    caskfs-directory-list .table-header .desktop-view {
      display: none;
    }
    caskfs-directory-list .name-container {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    caskfs-directory-list .name-container input[type="checkbox"] {
      margin: 0;
    }
    caskfs-directory-list .no-contents {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: 2rem 0;
    }
    @container (min-width: 775px) {
      caskfs-directory-list .table-header .desktop-view {
        display: grid;
        grid-template-columns: 3fr 1fr 1fr 1.5fr 1fr 30px;
        gap: .5rem;
        width: 100%;
      }
      caskfs-directory-list .table-header .mobile-view {
        display: none;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div>
      <caskfs-fs-breadcrumbs></caskfs-fs-breadcrumbs>
      <div>
        <div ?hidden=${!this.contents.length}>
          <div class='table-header'>
            <div class='desktop-view'>
              ${renderNameHeader.call(this)}
              <div>Kind</div>
              <div>Size</div>
              <div>Modified</div>
              <div>Modified By</div>
              <div></div>
            </div>
            <div class='mobile-view'>
              ${renderNameHeader.call(this)}
            </div>

          </div>
          ${this.contents.map(item => html`
            <caskfs-directory-item 
              @item-click=${e => this._onItemClick(e)}
              .data=${item.data}>
            </caskfs-directory-item>
          `)}
        </div>
        <div ?hidden=${this.contents.length} class='no-contents'>
          <cork-icon icon="fas.circle-exclamation" class='primary'></cork-icon>
          <div>This directory is empty</div>
        </div>
      </div>
    </div>
  `;
}

function renderNameHeader(){
  return html`
    <div class='name-container'>
      <input type="checkbox" 
        @click=${() => this.selectCtl.toggleAll()} 
        .checked=${this.selectCtl.allSelected}>
      <div>Name</div>
    </div>
  `
}