import config from './config.js';
import path from 'path';
import logger from './logger.js';

class Directory {

  /**
   * @method constructor
   * @description Create a new Directory instance.
   * 
   * @param {String} directory directory path 
   * @param {Object} opts 
   * @param {Object} opts.dbClient Required. database client instance
   * @returns {Promise<Directory>} Directory instance
   */
  async get(directory, opts={}) {
    return opts.dbClient.getDirectory(directory || '/');
  }

  /**
   * @method getChildren
   * @description Get the child directories of a given directory.
   * 
   * @param {String} directory directory path
   * @param {Object} opts
   * @param {Object} opts.dbClient Required. database client instance
   * 
   * @returns {Promise<Array>} array of child directory objects
   */
  async getChildren(directory, opts={}) {
    return opts.dbClient.getChildDirectories(directory, opts);
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
      let res = await opts.dbClient.query(
        `INSERT INTO ${config.database.schema}.directory (fullname, parent_id)
         VALUES ($1, $2)
         ON CONFLICT (fullname) DO UPDATE SET fullname = EXCLUDED.fullname
         RETURNING directory_id`,
        [fullPath, parentId]
      );
      parentId = res.rows[0].directory_id;
      currentPath = fullPath;
    }

    return parentId; // Return the parent directory ID
  }
}

export default Directory;