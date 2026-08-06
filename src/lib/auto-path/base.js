import path from 'path';
import { getLogger } from '../logger.js';

/**
 * @class AutoPath
 * @description Abstract base class for auto-path rule engines (eg bucket, partition) that derive
 * values from a file's path by matching configurable rules against path segments. Subclasses must
 * provide a `table` name and implement {@link AutoPath#getValue}.
 */
class AutoPath {

  /**
   * @param {Object} opts
   * @param {Object} opts.dbClient Database client used to read/write rule definitions
   * @param {String} opts.schema Database schema name containing the rules table
   * @param {String} opts.table Database table name storing rules for this auto-path type
   */
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


  /**
   * @method getConfig
   * @description Load (and cache in-memory) all auto-path rule rows for this type from the
   * database, compiling the `filter_regex` and `full_regex` text columns into RegExp instances.
   *
   * @param {Boolean} force if true, bypass the in-memory cache and re-query the database
   * @returns {Promise<Array<Object>>} array of rule row objects
   */
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
      if( row.full_regex ) {
        row.full_regex = new RegExp(row.full_regex);
      }
    });
    this.config = resp.rows;

    return this.config;
  }

  /**
   * @method remove
   * @description Delete an auto-path rule by name.
   *
   * @param {String} name name of the rule to remove
   * @returns {Promise<Object>} database query result
   */
  async remove(name) {
    if( !name ) {
      throw new Error('Name is required');
    }

    return this.dbClient.query(`
      DELETE FROM ${this.schema}.${this.table} WHERE name = $1
    `, [name]);
  }

  /**
   * @method exists
   * @description Check whether an auto-path rule with the given name exists.
   *
   * @param {String} name name of the rule to look up
   * @returns {Promise<Boolean>} true if a rule with this name exists
   */
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
   * @param {Number} opts.index Position of the directory segment to extract the value from
   *                             (0-based; 0 is the first directory segment)
   * @param {String} opts.filterRegex Regular expression to filter path segments
   * @param {String} opts.fullRegex Optional regular expression tested against the entire file
   *                                 path. If set, the rule only applies to files whose full path
   *                                 matches; when it does (or this is left unset), the existing
   *                                 index/filterRegex checks still run as usual against the
   *                                 individual path segments.
   * @param {String} opts.getValue JavaScript function to transform the extracted value.
   *                                Function signature: (name, pathValue, regexMatch) => string
   *
   * @returns {Boolean} true if the rule was set, false if no changes were made
   */
  async set(opts={}) {
    if( !opts.name ) {
      throw new Error('Name is required');
    }

    if( !opts.filterRegex && opts.index === undefined ) {
      throw new Error('Either filterRegex or index is required');
    }

    if( opts.index !== undefined && opts.index < 0 ) {
      throw new Error('Index must be 0 or greater');
    }

    if( opts.filterRegex && typeof opts.filterRegex !== 'string' ) {
      opts.filterRegex = opts.filterRegex.toString().replace(/^\/|\/$/g, '');
    }

    if( opts.fullRegex && typeof opts.fullRegex !== 'string' ) {
      opts.fullRegex = opts.fullRegex.toString().replace(/^\/|\/$/g, '');
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
      INSERT INTO ${this.schema}.${this.table} (name, index, filter_regex, full_regex, get_value)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) DO UPDATE SET
        index = EXCLUDED.index,
        filter_regex = EXCLUDED.filter_regex,
        full_regex = EXCLUDED.full_regex,
        get_value = EXCLUDED.get_value
    `, [opts.name, opts.index !== undefined ? opts.index : null, opts.filterRegex ? opts.filterRegex : null, opts.fullRegex ? opts.fullRegex : null, opts.getValue ? opts.getValue : null]);

    await this.getConfig(true);

    return true;
  }

  /**
   * @method getFromPath
   * @description Evaluate every configured rule of this type against a file path and collect the
   * results of any rules that match.
   *
   * @param {String} filePath file path to evaluate against all configured rules
   * @returns {Promise<Array<Object>>} array of {name, value} objects, one per matching rule
   */
  async getFromPath(filePath) {
    let partitions = [];

    await this.getConfig();
    for( let config of this.config ) {
      let result = this.getRuleFromPath(filePath, config.name);
      if( result ) partitions.push(result);
    }

    return partitions;
  }

  /**
   * @method getRuleFromPath
   * @description Evaluate a single named rule against a file path. If the rule defines a
   * `full_regex`, the entire file path must match it first, otherwise the rule is skipped and
   * `null` is returned without evaluating `index`/`filter_regex` at all. Once past that gate (or
   * when no `full_regex` is set), the directory segments of the path are optionally narrowed to a
   * single segment by `index` (0-based position) and then filtered by `filter_regex`, with the
   * first surviving segment producing the resulting value.
   *
   * @param {String} filePath file path to evaluate
   * @param {String} name name of the configured rule to evaluate
   * @returns {Object|null} {name, value} if the rule matches, otherwise null
   */
  getRuleFromPath(filePath, name) {
    let fileParts = path.parse(filePath);
    let rule = this.config.find(r => r.name === name);
    if( !rule ) {
      throw new Error(`Rule not found: ${name}`);
    }

    // gate: rule only applies at all if the entire path matches full_regex
    if( rule.full_regex && !rule.full_regex.test(filePath) ) {
      return null;
    }

    let dirParts = fileParts.dir.split('/').filter(p => p !== '');

    if( typeof rule.index === 'string' ) {
      rule.index = parseInt(rule.index);
    }

    if( typeof rule.get_value === 'string' ) {
      rule.getValue = new Function('name', 'pathValue', 'regexMatch', rule.get_value);
    }

    if( rule.index !== undefined && rule.index !== null ) {
      // the path doesn't have a segment at this position at all — the rule cannot match,
      // rather than falling through to match against the (wrong) unfiltered dirParts below
      if( dirParts.length <= rule.index ) {
        return null;
      }
      dirParts = [dirParts[rule.index]];
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

  /**
   * @method getValue
   * @description Abstract method that derives the final value for a matched rule. Subclasses
   * (eg {@link AutoPathBucket}, {@link AutoPathPartition}) must override this.
   *
   * @param {String} name name of the rule
   * @param {String} pathValue the matched path segment
   * @param {Array} regexMatch result of String.prototype.match() against filter_regex
   * @returns {String}
   */
  getValue(name, pathValue, regexMatch) {
    throw new Error('Not implemented');
  }

  /**
   * @method _cleanForCompare
   * @description Normalize a rule row/opts object for equality comparison by plucking only the
   * fields that actually define a rule (`name`, `index`, `filterRegex`, `fullRegex`, `getValue`) —
   * accepting either a DB row (snake_case) or an opts object (camelCase) — and stringifying
   * numbers so `0` compares equal on both sides. Every other property (a DB primary key, a CLI
   * progress callback on opts, a `dbClient` override, etc.) is deliberately ignored so it can
   * never cause a false "changed" result and trigger an unnecessary rescan.
   *
   * @param {Object} obj rule row or opts object to normalize
   * @returns {Object} a new object containing only the comparable rule fields that were present
   */
  _cleanForCompare(obj) {
    const fields = {
      name       : obj.name,
      index      : obj.index,
      filterRegex: obj.filterRegex !== undefined ? obj.filterRegex : obj.filter_regex,
      fullRegex  : obj.fullRegex !== undefined ? obj.fullRegex : obj.full_regex,
      getValue   : obj.getValue !== undefined ? obj.getValue : obj.get_value,
    };

    const cleaned = {};
    for( let key of Object.keys(fields) ) {
      let value = fields[key];
      if( value === undefined || value === null ) continue;
      if( typeof value === 'number' ) value = value + '';
      cleaned[key] = value;
    }
    return cleaned;
  }

  /**
   * @method _isEqual
   * @description Compare two rule objects (eg a DB row and a candidate opts object) for equality
   * after normalizing both with {@link AutoPath#_cleanForCompare}. Used by {@link AutoPath#set} to
   * detect no-op writes, since {@link AutoPathPartition#set} triggers an expensive retroactive
   * file rescan whenever a rule actually changes.
   *
   * @param {Object} obj1
   * @param {Object} obj2
   * @returns {Boolean} true if the normalized objects have identical keys/values
   */
  _isEqual(obj1, obj2) {
    obj1 = this._cleanForCompare(obj1);
    obj2 = this._cleanForCompare(obj2);

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