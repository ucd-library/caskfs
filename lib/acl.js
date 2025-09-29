import createLogger from './logger.js';

class Acl {

  constructor() {
    this.logger = createLogger('acl');
  }

  async all(pgClient) {
    let res = await pgClient.query(`SELECT * FROM ${config.database.schema}.directory_acl_view`);
    return res.rows;
  }

  async set(directory, roles, pgClient) {
    let res = await pgClient.query(`SELECT get_directory_id($1) AS directory_id`, [directory]);
    if (res.rows.length === 0) {
      throw new Error(`Directory ${directory} does not exist`);
    }
    let directoryId = res.rows[0].directory_id;

    let resp = await pgClient.query(
      `INSERT INTO ${config.database.schema}.directory_acl (directory_id, read, write)
       VALUES ($1, $2, $3)
       ON CONFLICT (directory_id) DO UPDATE SET read = EXCLUDED.read, write = EXCLUDED.write
       RETURNING directory_acl_id`,
      [directoryId, roles.read || [], roles.write || []]
    );
    let aclId = resp.rows[0].directory_acl_id;

    await pgClient.query(`UPDATE ${config.database.schema}.directory SET directory_acl_id = $1 WHERE directory_id = $2`, [aclId, directoryId]);

    await this._setChildrenAcl(directoryId, aclId, pgClient);

    return aclId;
  }

  /**
   * @method _setChildrenAcl
   * @description Recursively set the ACL for all child directories of a given directory.
   * Will always set the ACL for the given directory then query for all children that do not have
   * an explicit ACL set and update them as well.
   * 
   * @param {String} directoryId directory id to update
   * @param {String} aclId ACL id to set
   * @param {Object} pgClient PostgreSQL client
   */
  async _setChildren(directoryId, aclId, pgClient) {
    await pgClient.query(`UPDATE ${config.database.schema}.directory SET directory_acl_id = $1 WHERE directory_id = $2`, [aclId, directoryId]);

    // now update all children
    let res = await pgClient.query(`SELECT directory_id FROM ${config.database.schema}.directory_acl_view WHERE parent_id = $1 AND is_explicit = FALSE`, [directoryId]);
    for (let row of res.rows) {
      await this.setChildrenAcl(row.directory_id, aclId, pgClient);
    }
  }

}