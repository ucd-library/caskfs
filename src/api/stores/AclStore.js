import { LruStore } from '@ucd-lib/cork-app-utils';
import BaseStore from './BaseStore.js';

class AclStore extends BaseStore {

  constructor() {
    super();

    this.data = {
      whoami: new LruStore({name: 'acl.whoami'}),
      directoryAcl: new LruStore({name: 'acl.directoryAcl'}),
      setDirectoryPublic: new LruStore({name: 'acl.setDirectoryPublic'}),
      setDirectoryPermission: new LruStore({name: 'acl.setDirectoryPermission'}),
      removeDirectoryPermission: new LruStore({name: 'acl.removeDirectoryPermission'}),
      removeDirectoryAcl: new LruStore({name: 'acl.removeDirectoryAcl'}),
      roles: new LruStore({name: 'acl.roles'}),
      createRole: new LruStore({name: 'acl.createRole'}),
      deleteRole: new LruStore({name: 'acl.deleteRole'}),
      roleUsers: new LruStore({name: 'acl.roleUsers'}),
      users: new LruStore({name: 'acl.users'}),
      createUser: new LruStore({name: 'acl.createUser'}),
      deleteUser: new LruStore({name: 'acl.deleteUser'}),
      userRoles: new LruStore({name: 'acl.userRoles'}),
      addUserRole: new LruStore({name: 'acl.addUserRole'}),
      removeUserRole: new LruStore({name: 'acl.removeUserRole'})
    };
    this.events = {};
  }

}

const store = new AclStore();
export default store;
