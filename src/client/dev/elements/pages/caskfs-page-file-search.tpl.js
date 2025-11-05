import { html, css } from 'lit';

import '../components/caskfs-ld-filter-form.js';
import '../components/caskfs-ld-filter-buttons.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-file-search {
      display: block;
    }
    caskfs-ld-filter-form {
      margin-bottom: 1rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div>
    <div><h1 class="page-title">File Search</h1></div>
    <ol class="breadcrumbs"><li>File Search</li></ol>
    <div class="l-container">
      <div>
        <caskfs-ld-filter-form></caskfs-ld-filter-form>
        <caskfs-ld-filter-buttons></caskfs-ld-filter-buttons>
      </div>
    </div>
  </div>
`;}