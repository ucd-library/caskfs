import { html, css } from 'lit';
import appUrlUtils from '../utils/appUrlUtils.js';
import config from '../config.js';

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
    .current-user {
      font-size: .875rem;
      color: var(--ucd-black-60, #666);
      white-space: nowrap;
    }
    .acl-disabled-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .5rem;
      padding: .6rem 1rem;
      background-color: var(--ucd-gold, #ffbf00);
      color: var(--ucd-blue, #022851);
      font-weight: 700;
      text-align: center;
    }
    .impersonation-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: .75rem;
      padding: .6rem 1rem;
      background-color: var(--ucd-double-decker, #9c1913);
      color: white;
      font-weight: 700;
      text-align: center;
    }
    .impersonation-banner .impersonate-form {
      display: flex;
      align-items: center;
      gap: .5rem;
      font-weight: 400;
    }
    .impersonation-banner .impersonate-form input {
      font-weight: 400;
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
        width: 250px;
      }
    }
  `;

  return [elementStyles];
}

export function render() {
return html`
  ${renderHeader.call(this)}
  ${renderAclDisabledBanner.call(this)}
  ${renderImpersonationBanner.call(this)}
  <main>
    <cork-app-loader-bar></cork-app-loader-bar>
    <cork-app-error></cork-app-error>
    <cork-app-toast dismissable></cork-app-toast>
    <cork-app-dialog-modal></cork-app-dialog-modal>
    <caskfs-upload-tracker></caskfs-upload-tracker>
    <ucdlib-pages
      selected=${this.page}
      attr-for-selected='page-id'>
      <caskfs-page-home page-id='home'></caskfs-page-home>
      <caskfs-page-directory page-id='directory'></caskfs-page-directory>
      <caskfs-page-file-search page-id='file-search'></caskfs-page-file-search>
      <caskfs-page-partitions page-id='partitions'></caskfs-page-partitions>
      <caskfs-page-file-single page-id='file'></caskfs-page-file-single>
      <caskfs-page-relationships page-id='rel'></caskfs-page-relationships>
      <caskfs-page-statistics page-id='statistics'></caskfs-page-statistics>
      <caskfs-page-access page-id='access'></caskfs-page-access>
    </ucdlib-pages>
  </main>
`;}

function renderAclDisabledBanner(){
  if ( config.aclEnabled ) return '';
  return html`
    <div class="acl-disabled-banner">
      <cork-icon icon="fas.triangle-exclamation"></cork-icon>
      Access control (ACL) is disabled on this server — all files and directories are unrestricted.
    </div>
  `;
}

function renderImpersonationBanner(){
  if ( !config.impersonationEnabled ) return '';
  return html`
    <div class="impersonation-banner">
      <cork-icon icon="fas.user-secret"></cork-icon>
      <span>Impersonation is enabled on this server${this.currentUser?.username ? html` — acting as <strong>${this.currentUser.username}</strong>` : ''}</span>
      <form class="impersonate-form" @submit=${e => this._onImpersonateSubmit(e)}>
        <input
          type="text"
          placeholder="username"
          .value=${this.impersonateInput}
          @input=${e => this._onImpersonateInput(e)}>
        <button type="submit">Impersonate</button>
        ${this.currentUser?.username ? html`<button type="button" @click=${() => this._onImpersonateClear()}>Clear</button>` : ''}
      </form>
    </div>
  `;
}

function renderHeader(){
  return html`
    <ucd-theme-header>
      <div slot="branding-bar" class="branding-bar">
        <ucdlib-branding-bar
            site-name="UC Davis Library"
            site-url=${appUrlUtils.fullLocation()}
            slogan="Cask File System">
        </ucdlib-branding-bar>
        <!--<caskfs-partition-status-button></caskfs-partition-status-button> -->
        <div class="current-user" ?hidden=${!this.currentUser?.username}>
          Signed in as ${this.currentUser?.username}
        </div>
      </div>

      <ucd-theme-primary-nav>
        <ul link-text='File System'>
          <li><a href=${appUrlUtils.fullLocation('/directory')}>Directory</a></li>
          <li><a href=${appUrlUtils.fullLocation('/file-search')}>File Search</a></li>
        </ul>
        <ul link-text="Linked Data">
          <li><a href=${appUrlUtils.fullLocation('/rel')}>Relationships</a></li>
        </ul>
        <ul link-text='Config'>
          <li><a href=${appUrlUtils.fullLocation('/config/partitions')}>Partitions</a></li>
          <li ?hidden=${!(config.aclEnabled && this.currentUser?.isAdmin)}>
            <a href=${appUrlUtils.fullLocation('/config/access')}>Access</a>
          </li>
        </ul>
        <a href=${appUrlUtils.fullLocation('/statistics')}>Statistics</a>
      </ucd-theme-primary-nav>
    </ucd-theme-header>
  `;
}