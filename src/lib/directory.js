import config from './config.js';
import path from 'path';
import { getLogger } from './logger.js';

class Directory {

  constructor(opts={}) {
    this.logger = getLogger('Directory');
    this.acl = opts.acl;
  }

  /**
   * @method get
   * @description Get a directory by its path.  If no path is provided, the root directory is returned.
   *
   * @param {Object|CaskFSContext} context query options
   * @param {String} context.directory directory path
   * @param {Object} context.dbClient Required. database client instance
   * @returns {Promise<Directory>} Directory instance
   */
  async get(context={}) {
    let {dbClient, directory} = context.data
    return dbClient.getDirectory(directory || '/');
  }

  /**
   * @method getChildren
   * @description Get the child directories of a given directory.
   *
   * @param {String} directory directory path
   * @param {Object} opts
   * @param {Object} opts.dbClient Required. database client instance
   * @param {Number} opts.limit number of child directories to return, defaults to 100
   * @param {Number} opts.offset offset for return set
   *
   * @returns {Promise<Array>} array of child directory objects
   */
  async getChildren(context={}) {
    let {dbClient, directory, limit, offset, requestor, query} = context.data;
    return dbClient.getChildDirectories(directory, {limit, offset, requestor, query});
  }

  /**
   * @method mkdir
   * @description Create a directory and all parent directories if they do not exist.
   *
   * @param {String} directory Full path of the directory to create
   * @param {Object} opts options object
   *
   * @returns {Promise<String>} returns the directory ID of the created directory (children ids are not returned)
   */
  async mkdir(directory, opts={}) {
    let parts = directory.split('/').filter(p => p !== '');
    let currentPath = '/';

    // root directory
    let res = await opts.dbClient.query(`SELECT ${config.database.schema}.get_directory_id('/') AS directory_id`);
    if( res.rows.length === 0 ) {
      throw new Error('Root directory does not exist');
    }
    let parentId = res.rows[0].directory_id;

    // handle root directory case, fetch its ID if it exists
    if( parts.length === 0 ) {
      return parentId;
    }

    for (let part of parts) {
      let fullPath = path.posix.join(currentPath, part);

      let res = await opts.dbClient.query(`select ${config.database.schema}.get_directory_id($1) as directory_id`, [fullPath]);
      if( res.rows.length > 0 && res.rows[0].directory_id ) {
        // directory already exists, move to next
        parentId = res.rows[0].directory_id;
        currentPath = fullPath;
        continue;
      }

      // A brand new directory never has an ACL of its own to check, so look up
      // the parent's effective ACL (its own or inherited) before creating - this
      // is what the new directory needs to link to, not the root's.
      let parentAcl = await opts.dbClient.query(
        `SELECT root_directory_acl_id FROM ${config.database.schema}.directory_acl WHERE directory_id = $1`,
        [parentId]
      );
      let parentRootDirectoryAclId = parentAcl.rows[0]?.root_directory_acl_id || null;

      res = await opts.dbClient.query(
        `INSERT INTO ${config.database.schema}.directory (fullname, parent_id)
         VALUES ($1, $2)
         ON CONFLICT (fullname) DO UPDATE SET fullname = EXCLUDED.fullname
         RETURNING directory_id`,
        [fullPath, parentId]
      );
      parentId = res.rows[0].directory_id;
      currentPath = fullPath;

      // link the new directory to its parent's effective ACL, if any. Not
      // recursive - this directory was just created, so it has no children yet.
      if( parentRootDirectoryAclId ) {
        await this.acl.setDirectoryAcl({
          recurse: false,
          rootDirectoryAclId: parentRootDirectoryAclId,
          directoryId: parentId,
          dbClient: opts.dbClient
        });
      }
    }

    return parentId; // Return the parent directory ID
  }

  delete(opts={}) {
    return opts.dbClient.query(
        `DELETE FROM ${config.database.schema}.directory WHERE fullname = $1`,
      [opts.directory]
    );
  }

  /**
   * @method move
   * @description Rename or move a directory, and everything under it, in place. Rewrites the
   * fullname prefix for the directory and every descendant in a single statement — directory_id
   * and file_id values are untouched, only paths change. The `name` column recomputes automatically
   * since it is generated from fullname. Caller is responsible for confirming the source exists,
   * the destination does not already exist, and the destination is not a descendant of the source.
   *
   * @param {Object} opts
   * @param {String} opts.directory source directory full path
   * @param {String} opts.destPath destination full path
   * @param {String} opts.parentId directory_id of destPath's parent directory
   * @param {Object} opts.dbClient Required. database client instance
   *
   * @returns {Promise<void>}
   */
  async move(opts={}) {
    const { directory, destPath, parentId, dbClient } = opts;

    await dbClient.query(`
      UPDATE ${config.database.schema}.directory
      SET fullname = $2 || substring(fullname from length($1)+1)
      WHERE fullname = $1 OR fullname LIKE $1 || '/%'
    `, [directory, destPath]);

    await dbClient.query(`
      UPDATE ${config.database.schema}.directory
      SET parent_id = $1
      WHERE fullname = $2
    `, [parentId, destPath]);
  }
}

export default Directory;
