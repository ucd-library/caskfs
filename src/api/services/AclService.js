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
   * @description List all defined roles.
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async getRoles(modelAppStateOptions={}) {
    const id = 'roles';
    const store = this.store.data.roles;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list roles'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/roles`,
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
   * @description List all users assigned to a role.
   * @param {String} role
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async getRoleUsers(role, modelAppStateOptions={}) {
    const id = await digest({role});
    const store = this.store.data.roleUsers;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list role members'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/roles/${role}/users`,
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
   * @description List all defined users.
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async getUsers(modelAppStateOptions={}) {
    const id = 'users';
    const store = this.store.data.users;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list users'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users`,
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
   * @description List all roles assigned to a user. Callers may always look up their own
   * roles; looking up another user's roles requires the global admin role.
   * @param {String} user
   * @param {Object} modelAppStateOptions
   * @returns {Promise<Object>}
   */
  async getUserRoles(user, modelAppStateOptions={}) {
    const id = await digest({user});
    const store = this.store.data.userRoles;

    const appStateOptions = serviceUtils.mergeAppStateOptions(
      { errorSettings: {message: 'Unable to list user roles'} },
      modelAppStateOptions
    );

    await this.checkRequesting(
      id, store,
      () => this.request({
        url : `${this.baseUrl}/users/${user}/roles`,
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
