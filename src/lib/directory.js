import config from './config.js';
import path from 'path';
import { getLogger } from './logger.js';
import acl from './acl.js';

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

    // get root acl if it exists
    let rootAcl = await acl.getRootDirectoryAcl({
      dbClient: opts.dbClient,
      directory: '/'
    });

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

      res = await opts.dbClient.query(
        `INSERT INTO ${config.database.schema}.directory (fullname, parent_id)
         VALUES ($1, $2)
         ON CONFLICT (fullname) DO UPDATE SET fullname = EXCLUDED.fullname
         RETURNING directory_id`,
        [fullPath, parentId]
      );
      parentId = res.rows[0].directory_id;
      currentPath = fullPath;

      // if we don't have a rootAcl yet, check if the root directory has one
      if( !rootAcl ) {
        rootAcl = await acl.getRootDirectoryAcl({
          dbClient: opts.dbClient,
          directory: fullPath
        });
      }

      // if you have a rootAcl, set the directory to the current directory
      // this method will skip if the directory already has an explicit ACL set
      // and return the root_directory_acl_id if it was set.
      // This function is set to not recurse and only set the ACL on the current directory
      if( rootAcl ) {
        rootAcl.root_directory_acl_id = await this.acl.setDirectoryAcl({ 
          recurse: false,
          rootDirectoryAclId: rootAcl.root_directory_acl_id,
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
}

export default Directory;
