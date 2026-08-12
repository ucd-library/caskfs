import { html, css } from 'lit';
import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    .access-layout {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    @media (min-width: 480px) {
      .access-layout {
        flex-direction: row;
        gap: 2rem;
      }
    }
    .access-nav {
      display: flex;
      flex-direction: row;
      gap: .5rem;
      flex-shrink: 0;
    }
    @media (min-width: 480px) {
      .access-nav {
        flex-direction: column;
        width: 160px;
        border-right: 2px dotted var(--ucd-gold, #ffbf00);
        padding-right: 1.5rem;
      }
    }
    .nav-item {
      display: block;
      text-align: left;
      background: none;
      border: none;
      border-radius: .25rem;
      padding: .6rem 1rem;
      font-weight: 700;
      font-size: 1rem;
      color: var(--ucd-blue, #022851);
      cursor: pointer;
    }
    .nav-item:hover {
      background-color: var(--ucd-blue-30, #DBEAF7);
    }
    .nav-item.active {
      background-color: var(--ucd-blue, #022851);
      color: var(--ucd-white, #fff);
    }
    .access-content {
      flex: 1;
      min-width: 0;
    }
  `;

  return [elementStyles];
}

export function render() {
  return html`
    <div>
      <div><h1 class="page-title">Access</h1></div>
      <ol class="breadcrumbs">
        <li><a href="${appUrlUtils.fullLocation()}">Home</a></li>
        <li>Access</li>
      </ol>
      <div class="l-container u-space-mt--large">
        <div class="access-layout">
          <nav class="access-nav">
            <button
              class="nav-item ${this.activeTab === 'roles' ? 'active' : ''}"
              @click=${() => this._onTabClick('roles')}>
              Roles
            </button>
            <button
              class="nav-item ${this.activeTab === 'users' ? 'active' : ''}"
              @click=${() => this._onTabClick('users')}>
              Users
            </button>
          </nav>
          <div class="access-content">
            ${this.selected
              ? html`
                <caskfs-principal-relations
                  mode=${this.activeTab === 'roles' ? 'role-members' : 'user-roles'}
                  .name=${this.selected}
                  @caskfs-principal-relations-back=${this._onRelationsBack}>
                </caskfs-principal-relations>
              `
              : html`
                <caskfs-principal-list
                  type=${this.activeTab === 'roles' ? 'role' : 'user'}
                  @caskfs-principal-list-select=${this._onListSelect}>
                </caskfs-principal-list>
              `}
          </div>
        </div>
      </div>
    </div>
  `;
}
