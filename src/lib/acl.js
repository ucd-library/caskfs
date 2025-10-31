import { getLogger } from './logger.js';
import { AclAccessError } from './errors.js';
import config from './config.js';

class AclCache {

  constructor() {
    this.userRoleCache = new Map();
    this.dirPermissionsCache = new Map();
  }

  setUserRole(user, role, value) {
    if( config.acl.enabledCache !== true ) {
      return null;
    }
    let key = user+'-'+role;

    if( this.userRoleCache.has(key) ) {
      return null;
    }

    this.userRoleCache.set(key, value);
    setTimeout(() => {
      this.userRoleCache.delete(key);
    }, config.acl.cacheTTL);
  }

  getUserRole(user, role) {
    if( config.acl.enabledCache !== true ) {
      return null;
    }
    return this.userRoleCache.get(user+'-'+role);
  }

  setDirPermissions(user, filePath, permission, value) {
    if( config.acl.enabledCache !== true ) {
      return null;
    }
    let key = user+'-'+filePath+'-'+permission;
    if( this.dirPermissionsCache.has(key) ) {
      return null;
    }

    this.dirPermissionsCache.set(key, value);
    setTimeout(() => {
      this.dirPermissionsCache.delete(key);
    }, config.acl.cacheTTL);
  }

  getDirPermissions(user, filePath, permission) {
    if( config.acl.enabledCache !== true ) {
      return null;
    }
    return this.dirPermissionsCache.get(user+'-'+filePath+'-'+permission);
  }

}

// TODO: add caching for user roles and directory permissions

class Acl {

  constructor() {
    this.logger = getLogger('acl');
    this.enabled = config.acl.enabled !== undefined ? config.acl.enabled : false;
    this.cache = new AclCache();
  }

  /**
   * @method aclLookupRequired
   * @description Determine if an ACL lookup is required based on the following conditions:
   * - If opts.ignoreAcl is true, no lookup is required.
   * - If ACLs are disabled in the config, no lookup is required.
   * - If the user is an admin, no lookup is required.
   * 
   * @param {Object} opts
   * @param {String} opts.requestor - The user to check.
   * @param {Object} opts.dbClient - The database client instance.
   * @param {Boolean} opts.ignoreAcl - If true, skip ACL lookup.
   *  
   * @returns {Promise<Boolean>} - True if an ACL lookup is required, false otherwise.
   */
  async aclLookupRequired(opts={}) {
    if( opts.ignoreAcl === true ) {
      return false;
    }
    if( this.enabled === false ) {
      return false;
    }
    if( await this.isAdmin(opts) ) {
      return false;
    }
    return true;
  }

  /**
   * @method isAdmin
   * @description Check if a user has the config defined admin role.
   * A wrapper around userInRole for convenience.
   * 
   * @param {Object} opts
   * @param {String} opts.requestor - The user to check.
   * @param {Object} opts.dbClient - The database client instance.
   * 
   * @returns {Promise<Boolean>} - True if the user is an admin, false otherwise.
   */
  async isAdmin(opts={}) {
    return this.userInRole({ 
      ...opts, 
      role: config.acl.adminRole
    });
  }

  /**
   * @method userInRole
   * @description Check if a user is in a specific role.
   * 
   * @param {Object} opts
   * @param {String} opts.requestor - The user to check.
   * @param {String} opts.role - The role to check.
   * @param {Object} opts.dbClient - The database client instance.
   *
   * @returns {Promise<Boolean>} - True if the user is in the role, false otherwise. 
   */
  async userInRole(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('User, role and dbClient are required');
    }

    if( !opts.requestor ) return false;

    let cached = this.cache.getUserRole(opts.requestor, role);
    if( cached !== null ) return cached;

    let result = await dbClient.query(`
      SELECT 1 FROM ${config.database.schema}.acl_user_roles_view
      WHERE "user" = $1 AND "role" = $2
    `, [opts.requestor, role]);



    let value = result.rows.length > 0;
    this.cache.setUserRole(opts.requestor, role, value);
    return value;
  }

  /**
   * @method hasPermission
   * @description Check if a user has a specific permission on a file.
   * 
   * @param {Object} opts
   * @param {String} opts.requestor - The user to check permissions for.
   * @param {String} opts.filePath - The file or directory path to check permissions on.
   * @param {String} opts.permission - The permission to check (e.g. 'read', 'write', 'admin').
   * @param {Boolean} opts.isFile - Whether the path is a file. Default is false.
   * @param {Object} opts.dbClient - The database client instance.
   * @returns {Promise<Boolean>} - True if the user has the specified permission, false otherwise.
   */
  async hasPermission(opts={}) {
    let { filePath, permission, dbClient } = opts;

    if( !filePath || !permission || !dbClient ) {
      throw new Error('filePath, permission and dbClient are required');
    }

    let cached = this.cache.getDirPermissions(opts.requestor || 'PUBLIC', filePath, permission);
    if( cached !== null ) return cached;

    let permissionFilter;
    if( !opts.requestor ) {
      // cheat and only allow read access for public if no user is provided
      if( permission !== 'read' ) return false;
      permissionFilter = `can_read = true`;
    } else if( permission === 'read' ) {
      permissionFilter = `can_read = true`;
    } else if( permission === 'write' ) {
      permissionFilter = `can_write = true`;
    } else if( permission === 'admin' ) {
      permissionFilter = `is_admin = true`;
    } else {
      throw new AclAccessError('Invalid permission', opts.requestor, filePath, permission);
    }

    let args = [filePath];

    // handle user being null (public access)
    let user = opts.requestor;
    let withQueries = [];
    let userSelectQuery = '';
    if( !user ) {
      user = null;
      userSelectQuery = 'user_id IS NULL';
    } else {
      withQueries.push(`acluser AS (
        SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $2
      )`);
      userSelectQuery = 'user_id = (SELECT user_id FROM acluser)';
      args.push(user);
    }

    // handle are we checking a file or directory
    let isFile = opts.isFile || false;
    if( isFile ) {
      // write permission on files could be on directories that doesn't exist yet
      // so we need to look the first parent directory that does exist
      if( permission === 'write' ) {
        // TODO: optimize this to use recursive CTE or ltree extension
        let paths = filePath.split('/').filter(p => p !== '');
        let lookupPaths = [];
        for( let i = paths.length; i > 0; i-- ) {
          lookupPaths.push('/'+paths.slice(0, i).join('/'));
        }
        lookupPaths.push('/');

        withQueries.push(`dir AS (
          SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = ANY($1)
          ORDER BY LENGTH(fullname) DESC LIMIT 1
        )`);
        args[0] = lookupPaths;

      // read or admin permission on files can just look it up directly
      } else {
        withQueries.push(`dir AS (
          SELECT directory_id FROM ${config.database.schema}.file_view WHERE filepath = $1
        )`);
      }
    // directory, just look it up directly
    } else {
      withQueries.push(`dir AS (
        SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1
      )`);
    }

    let resp = await dbClient.query(`
      WITH ${withQueries.join(', ')}
      SELECT * from ${config.database.schema}.directory_user_permissions_lookup
      WHERE directory_id = (SELECT directory_id FROM dir)
      AND ${userSelectQuery}
      AND ${permissionFilter}
      `, args);

    let value = resp.rows.length > 0;
    this.cache.setDirPermissions(opts.requestor || 'PUBLIC', filePath, permission, value);
    return value;
  }

  /**
   * @method getUserRoles
   * @description Get roles for a specific user.
   *
   * @param {Object} opts
   * @param {String} opts.user Required. username
   * @param {Object} opts.dbClient Required. database client instance
   * 
   * @returns {Promise<Array>} array of role names
   */
  async getUserRoles(opts={}) {
    let { user, dbClient } = opts;
    if( !user || !dbClient ) {
      throw new Error('User and dbClient are required');
    }
    let res = await dbClient.query(`
      SELECT r.name AS role
      FROM ${config.database.schema}.acl_role r
      JOIN ${config.database.schema}.acl_role_user ur ON r.role_id = ur.role_id
      JOIN ${config.database.schema}.acl_user u ON ur.user_id = u.user_id
      WHERE u.name = $1`, [user]);
    return res.rows.map(r => r.role);
  }

  /**
   * @method getRoleId
   * @description Get the role ID for a specific role name.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<String>} role ID or null if it does not exist
   */
  getRoleId(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('Role and dbClient are required');
    }
    return dbClient.query(`SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $1`, [role]);
  }

  /**
   * @method getRole
   * @description Get all user role entries for a specific role name.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} role object or null if it does not exist
   */
  async getRole(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('Role and dbClient are required');
    }
    let res = await dbClient.query(`SELECT * FROM ${config.database.schema}.acl_user_roles_view WHERE role = $1`, [role]);
    return res.rows;
  }

  /**
   * @method ensureRole
   * @description Ensure a role exists.  If it does not exist, it will be created.
   *
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<String>} role ID
   */
  async ensureRole(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('Role and dbClient are required');
    }
    let res = await dbClient.query(`INSERT INTO ${config.database.schema}.acl_role (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING role_id`, [role]);
    if( res.rows.length === 0 ) {
      res = await dbClient.query(`SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $1`, [role]);
    }
    return res.rows[0].role_id;
  }

  /**
   * @method removeRole
   * @description Remove a role.  This will also remove all user-role associations.
   * 
   * @param {Object} opts
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} result of the delete query
   */
  async removeRole(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('Role and dbClient are required');
    }
    let res = await dbClient.query(`DELETE FROM ${config.database.schema}.acl_role WHERE name = $1 RETURNING role_id`, [role]);
    return res;
  }

  /**
   * @method ensureUser
   * @description Ensure a user exists.  If it does not exist, it will be created.
   *
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<String>} user ID
   */
  async ensureUser(opts={}) {
    let { user, dbClient } = opts;
    if( !user || !dbClient ) {
      throw new Error('User and dbClient are required');
    }
    let res = await dbClient.query(
      `INSERT INTO ${config.database.schema}.acl_user (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING user_id`, 
      [user]
    );
    if( res.rows.length === 0 ) {
      res = await dbClient.query(`SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $1`, [user]);
    }
    return res.rows[0].user_id;
  }

  /**
   * @method removeUser
   * @description Remove a user.  This will also remove all user-role associations
   * via foreign key constraints delete cascade.
   * 
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} result of the delete query
   */
  async removeUser(opts={}) {
    let { user, dbClient } = opts;
    if( !user || !dbClient ) {
      throw new Error('User and dbClient are required');
    }
    let res = await dbClient.query(`DELETE FROM ${config.database.schema}.acl_user WHERE name = $1 RETURNING user_id`, [user]);
    return res;
  }

  /**
   * @method getUserId
   * @description Get the user ID for a specific user name.
   *
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<String>} user ID
   */
  async getUserId(opts={}) {
    let { user, dbClient } = opts;
    if( !user || !dbClient ) {
      throw new Error('User and dbClient are required');
    }
    let res = await dbClient.query(`SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $1`, [user]);
    if( res.rows.length === 0 ) {
      throw new Error(`User ${user} does not exist`);
    }
    return res.rows[0].user_id;
  }

  /**
   * @method ensureUserRole
   * @description Ensure a user-role association exists.  If either
   * the user or role do not exist, they will be created. If the association
   * does not exist, it will be created.
   *
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<void>}
   */
  async ensureUserRole(opts={}) {
    let { user, role, dbClient } = opts;
    if( !user || !role || !dbClient ) {
      throw new Error('User, role and dbClient are required');
    }
    let userId = await this.ensureUser({ user, dbClient });
    let roleId = await this.ensureRole({ role, dbClient });
    await dbClient.query(`INSERT INTO ${config.database.schema}.acl_role_user (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING`, [userId, roleId]);    
  }

  /**
   * @method removeUserRole
   * @description Remove a user-role association.
   * 
   * @param {Object} opts
   * @param {String} opts.user Required. user name
   * @param {String} opts.role Required. role name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} result of the delete query
   */
  async removeUserRole(opts={}) {
    let { user, role, dbClient } = opts;
    if( !user || !role || !dbClient ) {
      throw new Error('User, role and dbClient are required');
    }

    // TODO: write getters 
    let userId = await this.ensureUser({ user, dbClient });
    let roleId = await this.ensureRole({ role, dbClient });
    let res = await dbClient.query(`
      WITH role AS (SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $2),
           user AS (SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $1)
      DELETE FROM ${config.database.schema}.acl_role_user WHERE user_id = (SELECT user_id FROM user) AND role_id = (SELECT role_id FROM role)`, [userId, roleId]);
    return res;
  }

  /**
   * @method getRootDirectoryAcls
   * @description Get all root directory ACLs.
   *
   * @param {Object} opts
   * @param {Object} opts.dbClient Required. database client instance
   * @param {Number} opts.limit Optional. number of results to return. default 100
   * @param {Number} opts.offset Optional. number of results to skip. default 0
   * 
   * @returns {Promise<Array>} list of root directory ACLs
   */
  async getRootDirectoryAcls(opts={}) {
    let {dbClient} = opts;
    if( !dbClient ) {
      throw new Error('dbClient is required');
    }

    let limit = opts.limit || 100;
    let offset = opts.offset || 0;

    let res = await dbClient.query(`
      SELECT 
        rda.*,
        d.fullname AS directory 
      FROM ${config.database.schema}.root_directory_acl rda
      LEFT JOIN ${config.database.schema}.directory d ON rda.directory_id = d.directory_id
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return res.rows;
  }

  /**
   * @method getRootDirectoryAcl
   * @description Get the root directory ACL for a specific directory.
   *
   * @param {Object} opts
   * @param {Object} opts.dbClient Required. database client instance
   * @param {String} opts.directory Required. directory ID
   * 
   * @returns {Promise<Object>} root directory acl object or null if it does not exist
   */
  async getRootDirectoryAcl(opts={}) {
    let {dbClient, directory} = opts;
    if( !dbClient || !directory ) {
      throw new Error('dbClient and directory are required');
    }
    let res = await dbClient.query(`
      SELECT rda.* 
      FROM ${config.database.schema}.directory d
      JOIN ${config.database.schema}.directory_acl da ON d.directory_id = da.directory_id
      JOIN ${config.database.schema}.root_directory_acl rda ON rda.directory_id = d.directory_id
      WHERE d.fullname = $1`, 
      [directory]
    );
    if( res.rows.length === 0 ) {
      return null;
    }
    return res.rows[0];
  }

  /**
   * @method getDirectoryAcl
   * @description Get the ACL for a specific directory, including permissions and 
   * roles.
   * 
   * @param {Object} opts 
   * @param {Object} opts.dbClient Required. database client instance
   * @param {String} opts.directory Required. directory path
   * 
   * @returns 
   */
  async getDirectoryAcl(opts={}) {
    let {dbClient, directory} = opts;
    if( !dbClient || !directory ) {
      throw new Error('dbClient and directory are required');
    }

    let res = await dbClient.query(`
      SELECT 
        d.fullname AS directory,
        d.directory_id,
        rd.directory_id AS root_acl_directory_id,
        rd.fullname AS root_acl_directory,
        rda.root_directory_acl_id,
        rda.public,
        json_agg(
          jsonb_build_object(
            'permission', p.permission,
            'role', r.name
          )
        ) AS permissions
      FROM ${config.database.schema}.directory d 
      LEFT JOIN ${config.database.schema}.directory_acl da ON d.directory_id = da.directory_id
      LEFT JOIN ${config.database.schema}.root_directory_acl rda ON da.root_directory_acl_id = rda.root_directory_acl_id
      LEFT JOIN ${config.database.schema}.directory rd ON rda.directory_id = rd.directory_id
      LEFT JOIN ${config.database.schema}.acl_permission p ON rda.root_directory_acl_id = p.root_directory_acl_id
      LEFT JOIN ${config.database.schema}.acl_role r ON p.role_id = r.role_id
      WHERE d.fullname = $1
      GROUP BY d.fullname, d.directory_id, rd.directory_id, rd.fullname, rda.root_directory_acl_id, rda.public 
      `, [directory]);
    if( res.rows.length === 0 ) {
      return null;
    }
    return res.rows;
  }

  /**
   * @method ensureRootDirectoryAcl
   * @description Ensure a root directory ACL exists for a specific directory.  
   * If it does not exist, it will be created.  This is a helper method for setDirectoryPermission
   * ensuring that a root directory ACL exists before setting permissions.
   * 
   * @param {Object} opts
   * @param {String} opts.directory Required. directory path
   * @param {Boolean} opts.isPublic Optional. set the directory as public. default false
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} object containing rootDirectoryAclId and directoryId
   */
  async ensureRootDirectoryAcl(opts={}) {
    let { dbClient, directory, isPublic } = opts;
    if( !dbClient || !directory ) {
      throw new Error('dbClient and directory are required');
    }

    let dir = await dbClient.query(`SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1`, [directory]);
    if( dir.rows.length === 0 ) {
      throw new Error(`Directory ${directory} does not exist`);
    }
    let directoryId = dir.rows[0].directory_id;

    let res = await dbClient.query(`
      INSERT INTO ${config.database.schema}.root_directory_acl (directory_id, public) 
      VALUES ($1, $2) 
      ON CONFLICT (directory_id) 
      DO UPDATE SET public = EXCLUDED.public,
                    modified = NOW()
      RETURNING root_directory_acl_id`, 
      [directoryId, isPublic || false]
    );
    let rootDirectoryAclId = res.rows[0].root_directory_acl_id;

    return {rootDirectoryAclId, directoryId};
  }

  /**
   * @method removeRootDirectoryAcl
   * @description Remove the root directory ACL for a specific directory.  
   * This will also remove all permissions associated with the ACL via foreign key constraints delete cascade.
   * After removing the ACL, this method will find the next parent directory with an ACL and apply it to all children
   * 
   * @param {Object} opts
   * @param {String} opts.directory Required. directory path
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<void>}
   */
  async removeRootDirectoryAcl(opts={}) {
    let { dbClient, directory } = opts;
    if( !dbClient || !directory ) {
      throw new Error('dbClient and directory are required');
    }
    let res = await dbClient.query(`
      WITH dir AS (
        SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1
      )
      DELETE FROM ${config.database.schema}.root_directory_acl 
      WHERE directory_id = (SELECT directory_id FROM dir)
      RETURNING root_directory_acl_id`, 
      [directory]
    );
    
    // find the next parent directory with an acl and apply it to all children that do not have an explicit acl
    if( res.rows[0].root_directory_acl_id ) {
      let parentRes = await dbClient.query(`
        WITH RECURSIVE parent_dirs AS (
          SELECT d.parent_id, d.directory_id, 0 as depth
          FROM ${config.database.schema}.directory d
          WHERE d.directory_id = (SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1)
          UNION
          SELECT d.parent_id, d.directory_id, pd.depth + 1  as depth
          FROM ${config.database.schema}.directory d
          JOIN parent_dirs pd ON d.directory_id = pd.parent_id
        )
        SELECT rda.root_directory_acl_id
        FROM parent_dirs pd
        JOIN ${config.database.schema}.root_directory_acl rda ON pd.directory_id = rda.directory_id
        WHERE pd.depth > 0  -- Exclude the current directory itself
        ORDER BY pd.depth ASC
        LIMIT 1`, [directory]);
      if( parentRes.rows.length > 0 ) {
        let parentRootDirectoryAclId = parentRes.rows[0].root_directory_acl_id;
        let dirRes = await dbClient.query(`SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1`, [directory]);
        if( dirRes.rows.length > 0 ) {
          let directoryId = dirRes.rows[0].directory_id;
          await this.setDirectoryAcl({ directoryId, rootDirectoryAclId: parentRootDirectoryAclId, dbClient });
        }
      }
    }

  }

  /**
   * @method removeDirectoryPermission
   * @description Remove a permission for a role on a directory.
   *
   * @param {Object} opts
   * @param {String} opts.directory Required. directory path
   * @param {String} opts.role Required. role name
   * @param {String} opts.permission Required. permission name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} result of the delete query
   */
  async removeDirectoryPermission(opts={}) {
    let { directory, role, permission, dbClient } = opts;
    if( !directory || !role || !permission || !dbClient ) {
      throw new Error('Directory, role, permission and dbClient are required');
    }

    let res = await dbClient.query(`
      WITH role AS (SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $2),
           dir AS (SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1),
           rda AS (SELECT root_directory_acl_id FROM ${config.database.schema}.root_directory_acl WHERE directory_id = (SELECT directory_id FROM dir))
      DELETE FROM ${config.database.schema}.acl_permission 
      WHERE root_directory_acl_id = (SELECT root_directory_acl_id FROM rda) 
        AND role_id = (SELECT role_id FROM role)
        AND permission = $3
      RETURNING acl_permission_id`, 
      [directory, role, permission]
    );
  
    return res;
  }

  /**
   * @method setDirectoryPermission
   * @description Set a permission for a role on a directory.  If the role does not exist, they will be created.
   * If the directory does not have a root directory ACL, one will be created.
   *
   * @param {Object} opts
   * @param {String} opts.directory Required. directory path
   * @param {String} opts.role Required. role name
   * @param {String} opts.permission Required. permission name
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Object>} result of the insert query
   */
  async setDirectoryPermission(opts={}) {
    let { directory, role, permission, dbClient } = opts;
    if( !directory || !role || !permission || !dbClient ) {
      throw new Error('Directory, role, permission and dbClient are required');
    }
 
    let roleId = await this.ensureRole({ role, dbClient });
    let {rootDirectoryAclId, directoryId} = await this.ensureRootDirectoryAcl({ directory, dbClient, public: false });

    let res = await dbClient.query(`
      INSERT INTO ${config.database.schema}.acl_permission (root_directory_acl_id, role_id, permission) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (root_directory_acl_id, role_id, permission) 
      DO UPDATE SET permission = EXCLUDED.permission
      RETURNING acl_permission_id`, 
      [rootDirectoryAclId, roleId, permission]
    );
    let aclPermissionId = res.rows[0].acl_permission_id;

    return { aclPermissionId, rootDirectoryAclId, roleId, directoryId };
  }

  /**
   * @method setDirectoryAcl
   * @description Set the root directory ACL for a specific directory and recursively apply it to all child directories.
   *
   * @param {Object} opts
   * @param {String} opts.directoryId Required. directory ID to set the ACL on
   * @param {String} opts.rootDirectoryAclId Required. root directory ACL id
   * @param {Object} opts.dbClient Required. database client instance
   * @param {Boolean} opts.recurse Optional. if false, will NOT recursively apply the ACL to all child directories. 
   *                                default true
   * 
   * @returns {Promise<void>}
   */
  async setDirectoryAcl(opts={}) {
    let { rootDirectoryAclId, directoryId, dbClient } = opts;
    if( !directoryId || !rootDirectoryAclId || !dbClient ) {
      throw new Error('directoryId, rootDirectoryAclId and dbClient are required');
    }

    // check if the directory already has an explicit acl set
    let res = await dbClient.query(`
      SELECT root_directory_acl_id FROM ${config.database.schema}.directory_acl WHERE directory_id = $1 AND root_directory_acl_id = $2
    `, [directoryId, rootDirectoryAclId]);

    if( res.rows.length > 0 ) {
      this.logger.debug(`Directory ${directoryId} already has an explicit ACL set to ${rootDirectoryAclId}, skipping`);
      return res.rows[0].root_directory_acl_id;
    }

    await dbClient.query(`
      INSERT INTO ${config.database.schema}.directory_acl (directory_id, root_directory_acl_id)
      VALUES ($1, $2)
      ON CONFLICT (directory_id) 
      DO UPDATE SET 
        root_directory_acl_id = EXCLUDED.root_directory_acl_id,
        modified = NOW()`, 
      [directoryId, rootDirectoryAclId]
    );

    if( opts.recurse === false ) {
      return rootDirectoryAclId;
    }

    let children = await dbClient.query(`
      SELECT d.directory_id, rda.root_directory_acl_id
      FROM ${config.database.schema}.directory d
      LEFT JOIN ${config.database.schema}.root_directory_acl rda ON d.directory_id = rda.directory_id
      WHERE d.parent_id = $1`, [directoryId]);
    for( let child of children.rows ) {
      if( child.root_directory_acl_id ) {
        this.logger.debug(`Child directory ${child.directory_id} has explicit root_directory_acl_id, skipping`);
        continue;
      }
      await this.setDirectoryAcl({ directoryId: child.directory_id, rootDirectoryAclId, dbClient });
    }
  }

  /**
   * @method refreshLookupTable
   * @description Refresh the directory_user_permissions_lookup materialized view.
   * This should be run after any changes to ACLs or permissions.  The view is used
   * for permission checks and is refreshed concurrently to avoid locking but is required
   * to ensure all query ACL checks are up to date.
   *
   * @param {Object} opts
   * @param {Object} opts.dbClient Required. database client instance
   * 
   * @returns {Promise<void>}
   */
  refreshLookupTable(opts={}) {
    let { dbClient } = opts;
    if( !dbClient ) {
      throw new Error('dbClient is required');
    }

    return dbClient.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${config.database.schema}.directory_user_permissions_lookup`);
  }

}

const impl = new Acl();
export default impl;