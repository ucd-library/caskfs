import {BaseService, digest} from '@ucd-lib/cork-app-utils';
import AclStore from '../stores/AclStore.js';

import appUrlUtils from '../../client/dev/utils/appUrlUtils.js';
import serviceUtils from '../utils/serviceUtils.js';

class AclService extends BaseService {

  constructor() {
    super();
    this.store = AclStore;
  }

  get baseUrl(){
    return `${appUrlUtils.basePath}/api/acl`;
  }

  /**
   * @description Build a `?search=&limit=&offset=` query string for the paginated
   * roles/users/membership list endpoints, omitting params that weren't provided.
   * @param {Object} opts
   * @param {String} [opts.search]
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @returns {String} query string, including a leading '?' if non-empty, else ''
   */
  _listQueryString({ search, limit, offset } = {}) {
    const params = new URLSearchParams();
    if ( search !== undefined && search !== null && search !== '' ) params.set('search', search);
    if ( limit !== undefined && limit !== null ) params.set('limit', limit);
    if ( offset !== undefined && offset !== null ) params.set('offset', offset);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * @description Report the caller's own identity - username, roles, and whether they hold
   * global admin access. No admin required.
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async getWhoAmI(modelAppStateOptions={}) {
    const id = 'whoami';
    const store = this.store.data.whoami;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {suppressError: true} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/whoami`,
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Get the ACL for a directory, including inherited permissions.
   * @param {String} directory
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async getDirectoryAcl(directory, modelAppStateOptions={}) {
    const id = await digest({directory});
    const store = this.store.data.directoryAcl;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to get directory ACL'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/directory${directory}`,
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Check whether the current user has the given permissions on a directory, in a
   * single request. Self-check only, not admin-gated - mirrors getWhoAmI's "tell me about
   * myself" pattern.
   * @param {String} directory
   * @param {Array<String>} permissions - e.g. ['write', 'admin']
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>} store record; payload is {directory, permissions: {write, admin, ...}}
   */
  async checkDirectoryPermissions(directory, permissions, modelAppStateOptions={}) {
    const id = await digest({directory, permissions: [...permissions].sort()});
    const store = this.store.data.directoryPermission;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {suppressError: true} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/directory${directory}/my-permission`,
        qs: { permission: permissions },
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Set or clear the public-read flag for a directory.
   * @param {String} directory
   * @param {Boolean} isPublic
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async setDirectoryPublic(directory, isPublic, modelAppStateOptions={}) {
    const body = { public: isPublic };
    const id = await digest({directory, ...body});
    const store = this.store.data.setDirectoryPublic;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to update the public flag'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/directory${directory}/public`,
        json: true,
        fetchOptions: { method: 'PUT', body },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Grant a principal (a role or a user) a permission on a directory.
   * @param {String} directory
   * @param {String} principal - role name or username, per principalType
   * @param {String} principalType - 'role' | 'user'
   * @param {String} permission - 'read' | 'write' | 'admin'
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async setDirectoryPermission(directory, principal, principalType, permission, modelAppStateOptions={}) {
    const body = { principal, principalType, permission };
    const id = await digest({directory, ...body});
    const store = this.store.data.setDirectoryPermission;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to grant access'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/directory${directory}/permissions`,
        json: true,
        fetchOptions: { method: 'POST', body },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Revoke a principal's (a role's or a user's) permission on a directory.
   * @param {String} directory
   * @param {String} principal
   * @param {String} principalType - 'role' | 'user'
   * @param {String} permission
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async removeDirectoryPermission(directory, principal, principalType, permission, modelAppStateOptions={}) {
    const body = { principal, principalType, permission };
    const id = await digest({directory, ...body});
    const store = this.store.data.removeDirectoryPermission;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to revoke access'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/directory${directory}/permissions`,
        json: true,
        fetchOptions: { method: 'DELETE', body },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Remove a directory's own ACL entirely - it reverts to inheriting from its
   * nearest ancestor.
   * @param {String} directory
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async removeDirectoryAcl(directory, modelAppStateOptions={}) {
    const id = await digest({directory});
    const store = this.store.data.removeDirectoryAcl;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to remove the directory ACL'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/directory${directory}`,
        fetchOptions: { method: 'DELETE' },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description List defined roles, optionally filtered/paginated.
   * @param {Object} [opts]
   * @param {String} [opts.search]
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>} {total, roles: [{roleId, role, created}]}
   */
  async getRoles(opts={}, modelAppStateOptions={}) {
    const id = await digest({...opts});
    const store = this.store.data.roles;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list roles'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/roles${this._listQueryString(opts)}`,
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Create a new role (no-op if it already exists).
   * @param {String} role
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async createRole(role, modelAppStateOptions={}) {
    const body = { role };
    const id = await digest(body);
    const store = this.store.data.createRole;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to create role'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/roles`,
        json: true,
        fetchOptions: { method: 'POST', body },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Remove a role and all of its user assignments and directory permissions.
   * @param {String} role
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async deleteRole(role, modelAppStateOptions={}) {
    const id = await digest({role});
    const store = this.store.data.deleteRole;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to delete role'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/roles/${role}`,
        fetchOptions: { method: 'DELETE' },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description List users assigned to a role, optionally filtered/paginated.
   * @param {String} role
   * @param {Object} [opts]
   * @param {String} [opts.search]
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>} {total, users: [{userId, user}]}
   */
  async getRoleUsers(role, opts={}, modelAppStateOptions={}) {
    const id = await digest({role, ...opts});
    const store = this.store.data.roleUsers;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list role members'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/roles/${role}/users${this._listQueryString(opts)}`,
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description List defined users, optionally filtered/paginated.
   * @param {Object} [opts]
   * @param {String} [opts.search]
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>} {total, users: [{userId, user, created}]}
   */
  async getUsers(opts={}, modelAppStateOptions={}) {
    const id = await digest({...opts});
    const store = this.store.data.users;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list users'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users${this._listQueryString(opts)}`,
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Create a new user (no-op if it already exists).
   * @param {String} user
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async createUser(user, modelAppStateOptions={}) {
    const body = { user };
    const id = await digest(body);
    const store = this.store.data.createUser;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to create user'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users`,
        json: true,
        fetchOptions: { method: 'POST', body },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Remove a user and all of their role assignments.
   * @param {String} user
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async deleteUser(user, modelAppStateOptions={}) {
    const id = await digest({user});
    const store = this.store.data.deleteUser;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to delete user'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users/${user}`,
        fetchOptions: { method: 'DELETE' },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description List roles assigned to a user, optionally filtered/paginated. Callers may
   * always look up their own roles; looking up another user's roles requires the global admin role.
   * @param {String} user
   * @param {Object} [opts]
   * @param {String} [opts.search]
   * @param {Number} [opts.limit]
   * @param {Number} [opts.offset]
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>} {total, roles: [roleName]}
   */
  async getUserRoles(user, opts={}, modelAppStateOptions={}) {
    const id = await digest({user, ...opts});
    const store = this.store.data.userRoles;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list user roles'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users/${user}/roles${this._listQueryString(opts)}`,
        parseResponseJson: true,
        checkCached : () => store.get(id),
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Assign a role to a user, creating either if needed.
   * @param {String} user
   * @param {String} role
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async addUserRole(user, role, modelAppStateOptions={}) {
    const body = { role };
    const id = await digest({user, ...body});
    const store = this.store.data.addUserRole;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to assign role'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users/${user}/roles`,
        json: true,
        fetchOptions: { method: 'POST', body },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

  /**
   * @description Remove a role from a user.
   * @param {String} user
   * @param {String} role
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async removeUserRole(user, role, modelAppStateOptions={}) {
    const id = await digest({user, role});
    const store = this.store.data.removeUserRole;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to remove role'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users/${user}/roles/${role}`,
        fetchOptions: { method: 'DELETE' },
        parseResponseJson: true,
        onUpdate : resp => this.store.set(
          {...resp, id},
          store,
          null,
          appStateOptions
        )
      })
    );

    return store.get(id);
  }

}

const service = new AclService();
export default service;
