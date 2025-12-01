import { html, css } from 'lit';
import './caskfs-fs-items.js';
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
    caskfs-directory-list .breadcrumbs-container {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    caskfs-directory-list .breadcrumbs-container caskfs-fs-breadcrumbs {
      flex-grow: 1;
    }
    caskfs-directory-list caskfs-fs-typeahead {
      width: 100%;
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
    @container (min-width: 500px) {
      caskfs-directory-list caskfs-fs-typeahead {
        width: 300px;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div>
      <div class='breadcrumbs-container'>
        <caskfs-fs-breadcrumbs></caskfs-fs-breadcrumbs>
        <caskfs-fs-typeahead 
          placeholder="Search this directory"
          .directory=${this.ctl.directoryPath.pathname}
          focus-first
          @caskfs-fs-typeahead-select=${this._onSearchSelect}>
        </caskfs-fs-typeahead>
      </div>
      <div>
        <div ?hidden=${!this.contents.length}>
          <div>
            <caskfs-fs-items .items=${this.contents.map(item => item.data)}></caskfs-fs-items>
          </div>
          <ucd-theme-pagination
            current-page=${this.ctl.qs.query.page || 1}
            max-pages=${this.totalPages}
            ellipses
            xs-screen
            @page-change=${this._onPageChange}
          ></ucd-theme-pagination>
        </div>
        <div ?hidden=${this.contents.length} class='no-contents'>
          <cork-icon icon="fas.circle-exclamation" class='primary'></cork-icon>
          <div>This directory is empty</div>
        </div>
      </div>
    </div>
  `;
}