import config from './config.js';
import PgClient from './pg-client.js';
import path from 'path';

class Directory {

  constructor(opts={}) {
    this.pgClient = opts.pgClient || new PgClient();
  }

  async get(directory, opts={}) {
    let pgClient = opts.pgClient || this.pgClient;
    let res = await pgClient.query(`SELECT * FROM ${config.pgSchema}.directory_acl_view WHERE directory = $1`, [directory]);
    if (res.rows.length === 0) {
      throw new Error(`Directory ${directory} does not exist`);
    }
    return res.rows[0];
  }

  async getChildren(directory, opts={}) {
    let pgClient = opts.pgClient || this.pgClient;
    let res = await pgClient.query(`
      with dir as (
        select directory_id from ${config.pgSchema}.directory where fullname = $1
      )
      SELECT * FROM ${config.pgSchema}.directory WHERE parent_id = (select directory_id from dir) order by fullname ASC;
    `, [directory]);

    return res.rows;
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
    let pgClient = opts.pgClient || this.pgClient;

    let parts = directory.split('/').filter(p => p !== '');
    let currentPath = '/';


    // root directory
    let res = await pgClient.query(`SELECT ${config.pgSchema}.get_directory_id('/') AS directory_id`);
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
      let res = await pgClient.query(
        `INSERT INTO ${config.pgSchema}.directory (fullname, parent_id)
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