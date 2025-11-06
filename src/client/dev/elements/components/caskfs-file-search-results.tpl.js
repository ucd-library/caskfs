import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-file-search-results {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div ?hidden=${!this.results.length}>
      <caskfs-fs-items 
        .items=${this.results} 
        show-directory-link 
        hide-type-icon 
        view='simple'>
      </caskfs-fs-items>
    <ucd-theme-pagination
      current-page=${this.ctl.qs.query.page || 1}
      max-pages=${this.totalPages}
      ellipses
      xs-screen
      @page-change=${this._onPageChange}
    ></ucd-theme-pagination>
    </div>
    <div ?hidden=${this.results.length} class='no-contents'>
      <cork-icon icon="fas.circle-exclamation" class='primary'></cork-icon>
      <div>No results found</div>
    </div>
  `;
}