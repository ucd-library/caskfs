import {BaseModel} from '@ucd-lib/cork-app-utils';
import AclService from '../services/AclService.js';
import AclStore from '../stores/AclStore.js';
import clearCache from '../utils/clearCache.js';

class AclModel extends BaseModel {

  constructor() {
    super();

    this.store = AclStore;
    this.service = AclService;

    this.register('AclModel');
  }

  getWhoAmI(appStateOptions={}) {
    return this.service.getWhoAmI(appStateOptions);
  }

  getDirectoryAcl(directory, appStateOptions={}) {
    return this.service.getDirectoryAcl(directory, appStateOptions);
  }

  async setDirectoryPublic(directory, isPublic, appStateOptions={}) {
    const res = await this.service.setDirectoryPublic(directory, isPublic, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  async setDirectoryPermission(directory, principal, principalType, permission, appStateOptions={}) {
    const res = await this.service.setDirectoryPermission(directory, principal, principalType, permission, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  async removeDirectoryPermission(directory, principal, principalType, permission, appStateOptions={}) {
    const res = await this.service.removeDirectoryPermission(directory, principal, principalType, permission, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  async removeDirectoryAcl(directory, appStateOptions={}) {
    const res = await this.service.removeDirectoryAcl(directory, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  getRoles(appStateOptions={}) {
    return this.service.getRoles(appStateOptions);
  }

  async createRole(role, appStateOptions={}) {
    const res = await this.service.createRole(role, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  async deleteRole(role, appStateOptions={}) {
    const res = await this.service.deleteRole(role, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  getRoleUsers(role, appStateOptions={}) {
    return this.service.getRoleUsers(role, appStateOptions);
  }

  getUsers(appStateOptions={}) {
    return this.service.getUsers(appStateOptions);
  }

  async createUser(user, appStateOptions={}) {
    const res = await this.service.createUser(user, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  async deleteUser(user, appStateOptions={}) {
    const res = await this.service.deleteUser(user, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  getUserRoles(user, appStateOptions={}) {
    return this.service.getUserRoles(user, appStateOptions);
  }

  async addUserRole(user, role, appStateOptions={}) {
    const res = await this.service.addUserRole(user, role, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

  async removeUserRole(user, role, appStateOptions={}) {
    const res = await this.service.removeUserRole(user, role, appStateOptions);
    if ( res.state === 'loaded' ) clearCache();
    return res;
  }

}

const model = new AclModel();
export default model;
