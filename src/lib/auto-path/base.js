import path from 'path';
import fs from 'fs/promises';

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

    await this.dbClient.query(`
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

    let dbClient = opts.dbClient || this.dbClient;

    await dbClient.query(`
      INSERT INTO ${this.schema}.${this.table} (name, index, filter_regex, get_value)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE SET 
        index = EXCLUDED.index, 
        filter_regex = EXCLUDED.filter_regex, 
        get_value = EXCLUDED.get_value
    `, [opts.name, opts.index || null, opts.filterRegex ? opts.filterRegex : null, opts.getValue ? opts.getValue : null]);
  }

  async getFromPath(filePath) {
    let partitions = [];

    await this.getConfig();
    for( let name in this.config ) {
      let result = this.getRuleFromPath(filePath, name);
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

}

export default AutoPath;