import { html, css } from 'lit';
import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .l-2col {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    @media (min-width: 992px) {
      .l-2col {
        grid-template-columns: 1fr 1fr;
      }
    }
    .create-form {
      display: flex;
      gap: .5rem;
      margin-bottom: 1rem;
    }
    .create-form input {
      flex: 1;
    }
    .item-row {
      border-bottom: 1px solid var(--ucd-black-20, #e5e5e5);
    }
    .item-row-header {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .5rem 0;
    }
    .item-row-header .name {
      flex: 1;
      font-weight: bold;
      cursor: pointer;
    }
    .item-detail {
      padding: .5rem 0 1rem 1rem;
    }
    .member-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .25rem 0;
    }
    .member-row .name {
      flex: 1;
    }
    .add-member-form {
      display: flex;
      align-items: flex-end;
      gap: .5rem;
      margin-top: .75rem;
    }
    .add-member-form caskfs-principal-typeahead {
      min-width: 12rem;
    }
    .no-items {
      color: var(--ucd-black-60, #666);
      padding: .5rem 0;
    }
  `;

  return [elementStyles];
}

function renderRoleRow(role) {
  const expanded = this.expandedRole === role.role;
  return html`
    <div class="item-row">
      <div class="item-row-header">
        <div class="name" @click=${() => this._onToggleRoleExpand(role.role)}>
          <cork-icon icon=${expanded ? 'fas.chevron-down' : 'fas.chevron-right'}></cork-icon>
          ${role.role}
        </div>
        <cork-icon-button
          icon="fas.trash"
          basic
          title="Delete role"
          link-aria-label="Delete role"
          @click=${() => this._onDeleteRole(role.role)}
        ></cork-icon-button>
      </div>
      <div class="item-detail" ?hidden=${!expanded}>
        <div>Members:</div>
        ${this.roleMembers.length ? this.roleMembers.map(m => html`
          <div class="member-row">
            <div class="name">${m.user}</div>
            <cork-icon-button
              icon="fas.xmark"
              basic
              title="Remove ${m.user} from ${role.role}"
              link-aria-label="Remove member"
              @click=${() => this._onRemoveMember(m.user)}
            ></cork-icon-button>
          </div>
        `) : html`<div class="no-items">No members.</div>`}
        <div class="add-member-form">
          <caskfs-principal-typeahead
            type="user"
            .value=${this.addMemberName}
            placeholder="Add a user..."
            @caskfs-principal-typeahead-input=${this._onAddMemberInput}
            @caskfs-principal-typeahead-select=${this._onAddMemberSelect}
          ></caskfs-principal-typeahead>
          <button class="btn btn--alt3" @click=${this._onAddMemberClick}>Add</button>
        </div>
      </div>
    </div>
  `;
}

function renderUserRow(user) {
  const expanded = this.expandedUser === user.user;
  return html`
    <div class="item-row">
      <div class="item-row-header">
        <div class="name" @click=${() => this._onToggleUserExpand(user.user)}>
          <cork-icon icon=${expanded ? 'fas.chevron-down' : 'fas.chevron-right'}></cork-icon>
          ${user.user}
        </div>
        <cork-icon-button
          icon="fas.trash"
          basic
          title="Delete user"
          link-aria-label="Delete user"
          @click=${() => this._onDeleteUser(user.user)}
        ></cork-icon-button>
      </div>
      <div class="item-detail" ?hidden=${!expanded}>
        <div>Roles:</div>
        ${this.userRoles.length ? this.userRoles.map(role => html`
          <div class="member-row">
            <div class="name">${role}</div>
            <cork-icon-button
              icon="fas.xmark"
              basic
              title="Remove ${role} from ${user.user}"
              link-aria-label="Remove role"
              @click=${() => this._onRemoveRoleFromUser(role)}
            ></cork-icon-button>
          </div>
        `) : html`<div class="no-items">No roles assigned.</div>`}
        <div class="add-member-form">
          <caskfs-principal-typeahead
            type="role"
            .value=${this.addRoleForUserName}
            placeholder="Assign a role..."
            @caskfs-principal-typeahead-input=${this._onAddRoleForUserInput}
            @caskfs-principal-typeahead-select=${this._onAddRoleForUserSelect}
          ></caskfs-principal-typeahead>
          <button class="btn btn--alt3" @click=${this._onAddRoleForUserClick}>Add</button>
        </div>
      </div>
    </div>
  `;
}

export function render() {
return html`
  <div>
    <div><h1 class="page-title">Access</h1></div>
    <ol class="breadcrumbs">
      <li><a href="${appUrlUtils.fullLocation()}">Home</a></li>
      <li>Access</li>
    </ol>
    <div class="l-container">
      <div class="l-2col">
        <div>
          <h2>Roles</h2>
          <div class="create-form">
            <input
              type="text"
              placeholder="New role name"
              .value=${this.newRoleName}
              @input=${this._onNewRoleNameInput}
            />
            <button class="btn btn--alt3" @click=${this._onCreateRole}>Add Role</button>
          </div>
          ${this.roles.length
            ? this.roles.map(role => renderRoleRow.call(this, role))
            : html`<div class="no-items">No roles defined.</div>`}
        </div>
        <div>
          <h2>Users</h2>
          <div class="create-form">
            <input
              type="text"
              placeholder="New username"
              .value=${this.newUserName}
              @input=${this._onNewUserNameInput}
            />
            <button class="btn btn--alt3" @click=${this._onCreateUser}>Add User</button>
          </div>
          ${this.users.length
            ? this.users.map(user => renderUserRow.call(this, user))
            : html`<div class="no-items">No users defined.</div>`}
        </div>
      </div>
    </div>
  </div>
`;}
