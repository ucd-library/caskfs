import { html, css } from 'lit';

import '../components/caskfs-ld-filter-form.js';
import '../components/caskfs-ld-filter-buttons.js';
import '../components/caskfs-file-search-results.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-file-search {
      display: block;
    }
    caskfs-ld-filter-form {
      margin-bottom: 1rem;
    }
    caskfs-page-file-search .find-controls {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    caskfs-page-file-search .filter-controls {
      flex-grow: 1;
    }
    @media (min-width: 500px) {
      caskfs-page-file-search .find-controls {
        flex-direction: row;
        gap: 1rem;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div>
    <div><h1 class="page-title">File Search</h1></div>
    <ol class="breadcrumbs">
      <li><a href=${appUrlUtils.fullPath()}>Home</a></li>
      <li>File Search</li>
    </ol>
    <div class="l-container">
      <div>
        <div class='find-controls'>
          <div class='filter-controls'>
            <caskfs-ld-filter-form></caskfs-ld-filter-form>
            <caskfs-ld-filter-buttons></caskfs-ld-filter-buttons>
          </div>
          <div>
            <cork-icon-button
              icon='fas.trash'
              color='medium'
              title='Delete Selected Items'
              ?hidden=${!this.ctl.select.selected.length}
              @click=${this._onBulkDeleteClick}
              link-aria-label='Delete Selected Items'>
            </cork-icon-button>
          </div>

        </div>

        <caskfs-file-search-results></caskfs-file-search-results>
      </div>
    </div>
  </div>
`;}