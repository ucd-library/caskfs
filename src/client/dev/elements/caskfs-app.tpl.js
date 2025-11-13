import { html, css } from 'lit';
import appUrlUtils from '../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    caskfs-app {
      display: block;
      padding-bottom: 2rem;
    }
    .branding-bar {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .branding-bar caskfs-partition-status-button {
      margin-bottom: 1rem;
    }
    @media (min-width: 768px) {
      .branding-bar {
        flex-direction: row;
        gap: 2rem;
        align-items: center;
        width: 100%;
      }
      .branding-bar ucdlib-branding-bar {
        flex-grow: 1;
      }
      .branding-bar caskfs-partition-status-button {
        margin-bottom: 0;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  ${renderHeader()}
  <cork-app-loader></cork-app-loader>
  <cork-app-error></cork-app-error>
  <cork-app-toast></cork-app-toast>
  <cork-app-dialog-modal></cork-app-dialog-modal>
  <ucdlib-pages
    selected=${this.page}
    attr-for-selected='page-id'>
    <caskfs-page-home page-id='home'></caskfs-page-home>
    <caskfs-page-directory page-id='directory'></caskfs-page-directory>
    <caskfs-page-file-search page-id='file-search'></caskfs-page-file-search>
    <caskfs-page-partitions page-id='partitions'></caskfs-page-partitions>
    <caskfs-page-file-single page-id='file'></caskfs-page-file-single>
    <caskfs-page-relationships page-id='rel'></caskfs-page-relationships>
  </ucdlib-pages>
`;}

function renderHeader(){
  return html`
    <ucd-theme-header>
      <div slot="branding-bar" class="branding-bar">
        <ucdlib-branding-bar
            site-name="UC Davis Library"
            site-url=${appUrlUtils.fullLocation()}
            slogan="Cask File System">
        </ucdlib-branding-bar>
        <caskfs-partition-status-button></caskfs-partition-status-button>
      </div>

      <ucd-theme-primary-nav>
        <ul link-text='File System'>
          <li><a href=${appUrlUtils.fullLocation('/directory')}>Directory</a></li>
          <li><a href=${appUrlUtils.fullLocation('/file-search')}>File Search</a></li>
        </ul>
        <ul link-text='Config'>
          <li><a href=${appUrlUtils.fullLocation('/config/partitions')}>Partitions</a></li>
        </ul>
      </ucd-theme-primary-nav>
    </ucd-theme-header>
  `;
}