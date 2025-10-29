import path from 'path';
import { getLogger } from '../logger.js';

class AutoPath {

  constructor(opts={}) {
    if( !opts.dbClient ) {
      throw new Error('Database client is required');
    }
    this.dbClient = opts.dbClient;

    if( !opts.schema ) {
      throw new Error('Schema name is required');
    }
    this.schema = opts.schema;

    if( !opts.table ) {
      throw new Error('Table name is required');
    }

    this.logger = getLogger(`AutoPath:${opts.table}`);

    this.opts = opts;
    this.table = opts.table;
  }


  async getConfig(force=false) {
    if( this.config && !force ) {
      return this.config;
    }

    let resp = await this.dbClient.query(`
      SELECT * FROM ${this.schema}.${this.table}
    `);

    resp.rows.forEach(row => {
      if( row.filter_regex ) {
        row.filter_regex = new RegExp(row.filter_regex);
      }
    });
    this.config = resp.rows;

    return this.config;
  }

  async remove(name) {
    if( !name ) {
      throw new Error('Name is required');
    }

    return this.dbClient.query(`
      DELETE FROM ${this.schema}.${this.table} WHERE name = $1
    `, [name]);
  }

  async exists(name) {
    if( !name ) {
      throw new Error('Name is required');
    }
    
    let resp = await this.dbClient.query(`
      SELECT * FROM ${this.schema}.${this.table} WHERE name = $1
    `, [name]);

    return resp.rows.length > 0;
  }

  /**
   * @method set
   * @description Set an auto-path rule
   *
   * @param {Object} opts
   * @param {String} opts.name Name of the rule
   * @param {Number} opts.index Position in the path to extract the value from (1-based)
   * @param {String} opts.filterRegex Regular expression to filter path segments
   * @param {String} opts.getValue JavaScript function to transform the extracted value. 
   *                                Function signature: (name, pathValue, regexMatch) => string
   * 
   * @returns {Boolean} true if the rule was set, false if no changes were made
   */
  async set(opts={}) {
    if( !opts.name ) {
      throw new Error('Name is required');
    }

    if( !opts.filterRegex && !opts.index ) {
      throw new Error('Either filterRegex or position is required');
    }

    if( opts.index < 1 ) {
      throw new Error('Position is required and must be greater than 0');
    }

    if( opts.filterRegex && typeof opts.filterRegex !== 'string' ) {
      opts.filterRegex = opts.filterRegex.toString().replace(/^\/|\/$/g, '');
    }

    let dbClient = opts.dbClient || this.dbClient;

    let currentDefinition = await dbClient.query(`
      SELECT * FROM ${this.schema}.${this.table} WHERE name = $1
    `, [opts.name]);

    if( currentDefinition.rows.length > 0 ) {
      currentDefinition = currentDefinition.rows[0];
    } else {
      currentDefinition = {};
    }

    // check if there are any changes, if not, return false
    // this is important as every file path has to be processed for partition keys
    if( this._isEqual(currentDefinition, opts) ) {
      // no changes
      this.logger.info('No changes to auto-path rule: ' + opts.name);
      return false
    }

    await dbClient.query(`
      INSERT INTO ${this.schema}.${this.table} (name, index, filter_regex, get_value)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE SET 
        index = EXCLUDED.index, 
        filter_regex = EXCLUDED.filter_regex, 
        get_value = EXCLUDED.get_value
    `, [opts.name, opts.index || null, opts.filterRegex ? opts.filterRegex : null, opts.getValue ? opts.getValue : null]);
    
    await this.getConfig(true);
      
    return true;
  }

  async getFromPath(filePath) {
    let partitions = [];

    await this.getConfig();
    for( let config of this.config ) {
      let result = this.getRuleFromPath(filePath, config.name);
      if( result ) partitions.push(result);
    }

    return partitions;
  }

  getRuleFromPath(filePath, name) {
    let fileParts = path.parse(filePath);
    let rule = this.config.find(r => r.name === name);
    if( !rule ) {
      throw new Error(`Rule not found: ${name}`);
    }

    let dirParts = fileParts.dir.split('/').filter(p => p !== '');

    if( rule.index === 'string' ) {
      rule.index = parseInt(rule.index);
    }

    if( typeof rule.get_value === 'string' ) {
      rule.getValue = new Function('name', 'pathValue', 'regexMatch', rule.get_value);
    }

    if( rule.index && dirParts.length >= rule.index ) {
      dirParts = [dirParts[rule.index - 1]];
    }

    if( rule.filter_regex ) {
      dirParts = dirParts.filter(p => rule.filter_regex.test(p));
    }

    if( dirParts.length > 0 ) {
      let name = rule.name;
      let pathValue = dirParts[0];
      let regexMatch = dirParts[0].match(rule.filter_regex);

      if( rule.getValue ) {
        return {name, value: rule.getValue(name, pathValue, regexMatch)};
      }

      return {name, value: this.getValue(
        name, pathValue, regexMatch
      )};
    }
    return null;
  }

  getValue(name, pathValue, regexMatch) {
    throw new Error('Not implemented');
  }

  _cleanForCompare(obj) {
    for( let key of Object.keys(obj) ) {
      if( key === 'auto_path_partition_id' ) {
        delete obj[key];
        continue;
      }
      if( obj[key] === undefined || obj[key] === null ) {
        delete obj[key];
        continue;
      }
      if( typeof obj[key] === 'number' ) {
        obj[key] = obj[key] + '';
      }
      if( key === 'filter_regex' ) {
        obj.filterRegex = obj.filter_regex;
        delete obj.filter_regex;
      }
    }
    return obj;
  }

  _isEqual(obj1, obj2) {
    obj1 = this._cleanForCompare(Object.assign({}, obj1));
    obj2 = this._cleanForCompare(Object.assign({}, obj2));

    if( Object.keys(obj1).length !== Object.keys(obj2).length ) {
      return false;
    }

    for( let key of Object.keys(obj1) ) {
      if( obj1[key] !== obj2[key] ) {
        return false;
      }
    }
    return true;
  }

}

export default AutoPath;