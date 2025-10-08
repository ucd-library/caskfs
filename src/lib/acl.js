import createLogger from './logger.js';

class Acl {

  constructor() {
    this.logger = createLogger('acl');
  }

  async getUserRoles(opts={}) {
    let { user, dbClient } = opts;
    if( !user || !dbClient ) {
      throw new Error('User and dbClient are required');
    }
    let res = await dbClient.query(`
      SELECT r.name AS role
      FROM ${config.database.schema}.acl_role r
      JOIN ${config.database.schema}.acl_user_role ur ON r.role_id = ur.role_id
      JOIN ${config.database.schema}.acl_user u ON ur.user_id = u.user_id
      WHERE u.name = $1`, [user]);
    return res.rows.map(r => r.role);
  }

  getRoleId(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('Role and dbClient are required');
    }
    return dbClient.query(`SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $1`, [role]);
  }

  getRole(opts={}) {
    let { role, dbClient } = opts;
    if( !role || !dbClient ) {
      throw new Error('Role and dbClient are required');
    }
    return dbClient.query(`SELECT * FROM ${config.database.schema}.acl_user_roles_view WHERE role = $1`, [role]);
  }

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

  async ensureUser(opts={}) {
    let { user, dbClient } = opts;
    if( !user || !dbClient ) {
      throw new Error('User and dbClient are required');
    }
    let res = await dbClient.query(`INSERT INTO ${config.database.schema}.acl_user (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING user_id`, [user]);
    if( res.rows.length === 0 ) {
      res = await dbClient.query(`SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $1`, [user]);
    }
    return res.rows[0].user_id;
  }

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

  async ensureUserRole(opts={}) {
    let { user, role, dbClient } = opts;
    if( !user || !role || !dbClient ) {
      throw new Error('User, role and dbClient are required');
    }
    let userId = await this.ensureUser({ user, dbClient });
    let roleId = await this.ensureRole({ role, dbClient });
    await dbClient.query(`INSERT INTO ${config.database.schema}.acl_user_role (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING`, [userId, roleId]);    
  }

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
      DELETE FROM ${config.database.schema}.acl_user_role WHERE user_id = (SELECT user_id FROM user) AND role_id = (SELECT role_id FROM role)`, [userId, roleId]);
    return res;
  }

  async getRootDirectoryAcls(opts={}) {
    let {dbClient} = opts;
    if( !dbClient ) {
      throw new Error('dbClient is required');
    }
    let res = await dbClient.query(`SELECT * FROM ${config.database.schema}.root_directory_acl`);
    return res.rows;
  }

  async ensureRootDirectoryAcl(opts={}) {
    let { dbClient, directory, public } = opts;
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
      [directoryId, public]
    );
    let rootDirectoryAclId = res.rows[0].root_directory_acl_id;

    return rootDirectoryAclId;
  }

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
          SELECT d.parent_id, d.directory_id
          FROM ${config.database.schema}.directory d
          WHERE d.directory_id = (SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1)
          UNION
          SELECT d.parent_id, d.directory_id
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

  async removeDirectoryPermission(opts={}) {
    let { directory, role, dbClient } = opts;
    if( !directory || !role || !dbClient ) {
      throw new Error('Directory, role and dbClient are required');
    }

    let res = await dbClient.query(`
      WITH role AS (SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $2),
           dir AS (SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1),
           rda AS (SELECT root_directory_acl_id FROM ${config.database.schema}.root_directory_acl WHERE directory_id = (SELECT directory_id FROM dir))
      DELETE FROM ${config.database.schema}.acl_permission 
      WHERE root_directory_acl_id = (SELECT root_directory_acl_id FROM rda) 
        AND role_id = (SELECT role_id FROM role)
      RETURNING acl_permission_id`, 
      [directory, role]
    );
  
    return res;
  }

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
      ON CONFLICT (root_directory_acl_id, role_id) 
      DO UPDATE SET permission = EXCLUDED.permission
      RETURNING acl_permission_id`, 
      [rootDirectoryAclId, roleId, permission]
    );
    let aclPermissionId = res.rows[0].acl_permission_id;

    return { aclPermissionId, rootDirectoryAclId, roleId, directoryId };
  }

  async setDirectoryAcl(opts={}) {
    let { rootDirectoryAclId, directoryId, dbClient } = opts;
    if( !directoryId || !rootDirectoryAclId || !dbClient ) {
      throw new Error('directoryId, rootDirectoryAclId and dbClient are required');
    }

    // check if the directory already has an explicit acl set
    let res = await dbClient.query(`
      SELECT 1 FROM ${config.database.schema}.directory_acl WHERE directory_id = $1 AND root_directory_acl_id = $2
    `, [directoryId, rootDirectoryAclId]);

    if( res.rows.length > 0 ) {
      this.logger.debug(`Directory ${directoryId} already has an explicit ACL set to ${rootDirectoryAclId}, skipping`);
      return;
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

    let children = await dbClient.query(`
      SELECT d.directory_id, rda.root_directory_acl_id
      FROM ${config.database.schema}.directory d
      LEFT JOIN ${config.database.schema}.root_directory_acl rda ON d.directory_id = rda.directories_id
      WHERE d.parent_id = $1`, [directoryId]);
    for( let child of children.rows ) {
      if( child.root_directory_acl_id ) {
        this.logger.debug(`Child directory ${child.directory_id} has explicit root_directory_acl_id, skipping`);
        continue;
      }
      await this.setDirectoryAcl({ directoryId: child.directory_id, rootDirectoryAclId, dbClient });
    }
  }

}

export default Acl;