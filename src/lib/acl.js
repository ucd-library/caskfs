import createLogger from './logger.js';

class Acl {

  constructor() {
    this.logger = createLogger('acl');
  }

  async getUserRoles(opts={}) {
    let { user, pgClient } = opts;
    if( !user || !pgClient ) {
      throw new Error('User and pgClient are required');
    }
    let res = await pgClient.query(`
      SELECT r.name AS role
      FROM ${config.database.schema}.acl_role r
      JOIN ${config.database.schema}.acl_user_role ur ON r.role_id = ur.role_id
      JOIN ${config.database.schema}.acl_user u ON ur.user_id = u.user_id
      WHERE u.name = $1`, [user]);
    return res.rows.map(r => r.role);
  }

  async ensureRole(opts={}) {
    let { role, pgClient } = opts;
    if( !role || !pgClient ) {
      throw new Error('Role and pgClient are required');
    }
    let res = await pgClient.query(`INSERT INTO ${config.database.schema}.acl_role (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING role_id`, [role]);
    if( res.rows.length === 0 ) {
      res = await pgClient.query(`SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $1`, [role]);
    }
    return res.rows[0].role_id;
  }

  async ensureUser(opts={}) {
    let { user, pgClient } = opts;
    if( !user || !pgClient ) {
      throw new Error('User and pgClient are required');
    }
    let res = await pgClient.query(`INSERT INTO ${config.database.schema}.acl_user (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING user_id`, [user]);
    if( res.rows.length === 0 ) {
      res = await pgClient.query(`SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $1`, [user]);
    }
    return res.rows[0].user_id;
  }

  async ensureUserRole(opts={}) {
    let { user, role, pgClient } = opts;
    if( !user || !role || !pgClient ) {
      throw new Error('User, role and pgClient are required');
    }
    let userId = await this.ensureUser({ user, pgClient });
    let roleId = await this.ensureRole({ role, pgClient });
    let res = await pgClient.query(`INSERT INTO ${config.database.schema}.acl_user_role (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING`, [userId, roleId]);
    return res;
  }

  async removeUserRole(opts={}) {
    let { user, role, pgClient } = opts;
    if( !user || !role || !pgClient ) {
      throw new Error('User, role and pgClient are required');
    }
    let userId = await this.ensureUser({ user, pgClient });
    let roleId = await this.ensureRole({ role, pgClient });
    let res = await pgClient.query(`
      WITH role AS (SELECT role_id FROM ${config.database.schema}.acl_role WHERE name = $2),
           user AS (SELECT user_id FROM ${config.database.schema}.acl_user WHERE name = $1)
      DELETE FROM ${config.database.schema}.acl_user_role WHERE user_id = (SELECT user_id FROM user) AND role_id = (SELECT role_id FROM role)`, [userId, roleId]);
    return res;
  }

  async getRootDirectoryAcls(opts={}) {
    let {pgClient} = opts;
    if( !pgClient ) {
      throw new Error('pgClient is required');
    }
    let res = await pgClient.query(`SELECT * FROM ${config.database.schema}.root_directory_acl`);
    return res.rows;
  }

  async ensureRootDirectoryAcl(opts={}) {
    let { pgClient, directory, public } = opts;
    if( !pgClient || !directory ) {
      throw new Error('pgClient and directory are required');
    }
    let res = await pgClient.query(`
      WITH dir AS (
        SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1
      )
      INSERT INTO ${config.database.schema}.root_directory_acl (directory_id, public) 
      VALUES ((SELECT directory_id FROM dir), $2) 
      ON CONFLICT (directory_id) 
      DO UPDATE SET public = EXCLUDED.public
      RETURNING root_directory_acl_id`, 
      [directory, public]
    );
    return res.rows[0].root_directory_acl_id;
  }

  async removeRootDirectoryAcl(opts={}) {
    let { pgClient, directory } = opts;
    if( !pgClient || !directory ) {
      throw new Error('pgClient and directory are required');
    }
    let res = await pgClient.query(`
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
      let parentRes = await pgClient.query(`
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
        let dirRes = await pgClient.query(`SELECT directory_id FROM ${config.database.schema}.directory WHERE fullname = $1`, [directory]);
        if( dirRes.rows.length > 0 ) {
          let directoryId = dirRes.rows[0].directory_id;
          await this.setDirectoryAcl({ directoryId, rootDirectoryAclId: parentRootDirectoryAclId, pgClient });
        }
      }
    }

  }

  async setDirectoryPermission(opts={}) {
    let { directory, role, permission, pgClient } = opts;
    if( !directory || !role || !permission || !pgClient ) {
      throw new Error('Directory, role, permission and pgClient are required');
    }
 
    let roleId = await this.ensureRole({ role, pgClient });
    let rootDirectoryAclId = await this.ensureRootDirectoryAcl({ directory, pgClient, public: false });

    let res = await pgClient.query(`
      INSERT INTO ${config.database.schema}.acl_permission (root_directory_acl_id, role_id, permission) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (root_directory_acl_id, role_id) 
      DO UPDATE SET permission = EXCLUDED.permission
      RETURNING acl_permission_id`, 
      [rootDirectoryAclId, roleId, permission]
    );
    return res.rows[0].acl_permission_id;
  }

  async setDirectoryAcl(opts={}) {
    let { rootDirectoryAclId, directoryId, pgClient } = opts;
    if( !directoryId || !rootDirectoryAclId || !pgClient ) {
      throw new Error('directoryId, rootDirectoryAclId and pgClient are required');
    }

    // check if the directory already has an explicit acl set
    let res = await pgClient.query(`
      SELECT 1 FROM ${config.database.schema}.directory_acl WHERE directory_id = $1 AND root_directory_acl_id = $2
    `, [directoryId, rootDirectoryAclId]);

    if( res.rows.length > 0 ) {
      this.logger.debug(`Directory ${directoryId} already has an explicit ACL set to ${rootDirectoryAclId}, skipping`);
      return;
    }

    await pgClient.query(`
      INSERT INTO ${config.database.schema}.directory_acl (directory_id, root_directory_acl_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING`, [directoryId, rootDirectoryAclId]
    );

    let children = await pgClient.query(`
      SELECT d.directory_id, rda.root_directory_acl_id
      FROM ${config.database.schema}.directory d
      LEFT JOIN ${config.database.schema}.root_directory_acl rda ON d.directory_id = rda.directories_id
      WHERE d.parent_id = $1`, [directoryId]);
    for( let child of children.rows ) {
      if( child.root_directory_acl_id ) {
        this.logger.debug(`Child directory ${child.directory_id} has explicit root_directory_acl_id, skipping`);
        continue;
      }
      await this.setDirectoryAcl({ directoryId: child.directory_id, rootDirectoryAclId, pgClient });
    }
  }

}