import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';
import buttonStyles from '@ucd-lib/theme-sass/2_base_class/_buttons.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .directory-path {
      font-family: monospace;
      word-break: break-all;
      font-weight: bold;
    }
    .hint {
      color: var(--ucd-black-60, #666);
      font-size: .875rem;
      margin: .25rem 0 1rem 0;
    }
    .error-message {
      color: var(--double-decker, #c10230);
      font-weight: bold;
    }
    .permission-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .4rem 0;
      border-bottom: 1px solid var(--ucd-black-20, #e5e5e5);
    }
    .permission-row .principal-name {
      flex: 1;
      font-weight: bold;
    }
    .badge {
      display: inline-block;
      font-size: .7rem;
      font-weight: bold;
      text-transform: uppercase;
      padding: .1rem .4rem;
      border-radius: .2rem;
      letter-spacing: .03em;
    }
    .badge-role {
      background-color: var(--ucd-blue-30, #DBEAF7);
      color: var(--ucd-blue-100, #022851);
    }
    .badge-user {
      background-color: var(--ucd-gold-30, #FFF9E6);
      color: var(--ucd-brown, #4a3319);
    }
    .permission-name {
      text-transform: capitalize;
    }
    .no-permissions {
      color: var(--ucd-black-60, #666);
      padding: .5rem 0;
    }
    .add-form {
      display: flex;
      align-items: flex-end;
      gap: .5rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
    .add-form > div {
      display: flex;
      flex-direction: column;
    }
    .add-form caskfs-principal-typeahead {
      min-width: 14rem;
    }
    .section {
      margin-bottom: 1.5rem;
    }
    .danger-zone {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--ucd-black-20, #e5e5e5);
    }
  `;

  return [
    formStyles,
    buttonStyles,
    elementStyles
  ];
}

function principalBadge(type) {
  return html`<span class="badge badge-${type}">${type}</span>`;
}

function renderPermissionRow(item, opts, onRemove) {
  return html`
    <div class="permission-row">
      ${principalBadge(item.principalType)}
      <div class="principal-name">${item.principalName}</div>
      <div class="permission-name">${item.permission}</div>
      ${opts.readOnly ? '' : html`
        <cork-icon-button
          icon="fas.xmark"
          title="Revoke ${item.permission} from ${item.principalName}"
          link-aria-label="Revoke access"
          @click=${() => onRemove(item)}
        ></cork-icon-button>
      `}
    </div>
  `;
}

export function render() {
  if ( this.loading && !this.acl ) {
    return html`<div>Loading...</div>`;
  }

  if ( this.errorMessage ) {
    return html`<div class="error-message">${this.errorMessage}</div>`;
  }

  if ( !this.acl ) return html``;

  const permissions = this.acl.permissions || [];

  return html`
    <div>
      ${this.hasNoAclAnywhere ? html`
        <div class="section">
          <p class="hint">No ACL exists anywhere above this directory - the default applies:
            no access except for global admins.</p>
          <button class="btn btn--alt3" @click=${this._onCreateAclHere}>Create ACL Here</button>
        </div>
      ` : this.isInherited ? html`
        <div class="section">
          <p class="hint">This directory inherits its ACL from
            <span class="directory-path">${this.acl.root_acl_directory}</span>.</p>
          <div>Public read access: ${this.acl.public ? 'Yes' : 'No'}</div>
          ${permissions.length
            ? permissions.map(p => renderPermissionRow(p, {readOnly: true}))
            : html`<div class="no-permissions">No permissions granted.</div>`}
          <div class="add-form">
            <button class="btn btn--alt3" @click=${this._onCreateAclHere}>Create ACL Here</button>
            <button class="btn btn--alt" @click=${this._onGoToRoot}>Go To Root ACL Directory</button>
          </div>
        </div>
      ` : html`
        <div class="section">
          <label>
            <input
              type="checkbox"
              .checked=${!!this.acl.public}
              @change=${this._onTogglePublic}
            />
            Public read access
          </label>
        </div>

        <div class="section">
          <h3>Permissions</h3>
          ${permissions.length
            ? permissions.map(p => renderPermissionRow(p, {readOnly: false}, this._onRemovePermission.bind(this)))
            : html`<div class="no-permissions">No permissions granted.</div>`}

          <div class="add-form">
            <div>
              <label>Type</label>
              <select .value=${this.addPrincipalType} @change=${this._onAddPrincipalTypeChange}>
                <option value="role">Role</option>
                <option value="user">User</option>
              </select>
            </div>
            <div>
              <label>Name</label>
              <caskfs-principal-typeahead
                .type=${this.addPrincipalType}
                .value=${this.addPrincipalName}
                placeholder="Search ${this.addPrincipalType === 'user' ? 'users' : 'roles'}..."
                @caskfs-principal-typeahead-input=${this._onAddPrincipalNameInput}
                @caskfs-principal-typeahead-select=${this._onAddTypeaheadSelect}
              ></caskfs-principal-typeahead>
            </div>
            <div>
              <label>Permission</label>
              <select .value=${this.addPermission} @change=${this._onAddPermissionChange}>
                ${this.permissions.map(p => html`<option value=${p}>${p}</option>`)}
              </select>
            </div>
            <button class="btn btn--alt3" @click=${this._onAddPermissionClick}>Add</button>
          </div>
        </div>

        <div class="danger-zone">
          <button class="btn btn--alt" @click=${this._onRemoveAcl}>Remove This Directory's ACL</button>
        </div>
      `}
    </div>
  `;
}
