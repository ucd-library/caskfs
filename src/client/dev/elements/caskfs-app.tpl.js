import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-app {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  ${renderHeader()}
  <ucdlib-pages
    selected=${this.page}
    attr-for-selected='page-id'>
    <caskfs-page-home page-id='home'></caskfs-page-home>
    <caskfs-page-directory page-id='directory'></caskfs-page-directory>
    <caskfs-page-file-search page-id='file-search'></caskfs-page-file-search>
    <caskfs-page-partitions page-id='partitions'></caskfs-page-partitions>
  </ucdlib-pages>
`;}

function renderHeader(){
  return html`
    <ucd-theme-header>
      <ucdlib-branding-bar
        site-name="UC Davis Library"
        slogan="Cask File System">
      </ucdlib-branding-bar>
      <ucd-theme-primary-nav>
        <ul link-text='Filesystem'>
          <li><a href='/directory'>Directory</a></li>
          <li><a href='/file-search'>File Search</a></li>
        </ul>
        <ul link-text='Config'>
          <li><a href='/config/partitions'>Partitions</a></li>
        </ul>
      </ucd-theme-primary-nav>
    </ucd-theme-header>
  `;
}