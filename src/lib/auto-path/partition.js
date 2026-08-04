import AutoPath from "./base.js";
import Database from "../database/index.js";
import config from "../config.js";

/**
 * @class AutoPathPartition
 * @description Auto-path rule engine that derives partition key values from a file's path. Unlike
 * the base class, setting a rule here retroactively re-applies it to every existing file (see
 * {@link AutoPathPartition#set}).
 */
class AutoPathPartition extends AutoPath {

  /**
   * @param {Object} opts see {@link AutoPath} constructor
   */
  constructor(opts={}) {
    super({
      table : 'auto_path_partition',
      ...opts
    });
  }

  /**
   * @method getValue
   * @description Default value extractor for partition rules: `<name>-<pathValue>`.
   *
   * @param {String} name name of the rule
   * @param {String} pathValue the matched path segment
   * @returns {String} the partition key value
   */
  getValue(name, pathValue) {
    return name+'-'+pathValue;
  }

  /**
   * @method set
   * @description Set a partition auto-path rule. If the rule definition actually changed, every
   * existing file is re-scanned in batches and the rule is (re-)applied via the
   * `add_partition_key` database function, since files written before the rule existed still need
   * their partition keys backfilled.
   *
   * @param {Object} opts see {@link AutoPath#set}
   * @param {Function} [opts.cb] optional progress callback invoked with {total, completed} as the
   *                              backfill proceeds
   * @returns {Promise<void>}
   */
  async set(opts) {
    let updated = await super.set(opts);
    if( !updated ) return;

    let name = opts.name;
    let dbClient = opts.dbClient || this.dbClient;

    let query = 'SELECT file_id, filepath FROM ' + this.schema + '.file_view';
    let batchDbClient = new Database({type: this.opts.dbType || config.database.client});

    // emit progress callbacks
    let total = 0;
    let completed = 0;
    if( opts.cb ) {
      total = await dbClient.query(`SELECT count(*) as count FROM ${this.schema}.file`);
      total = parseInt(total.rows[0].count);
      opts.cb({total, completed});
    }

    for await (let rows of batchDbClient.client.batch(query)) {
      for( let row of rows ) {
        let result = this.getRuleFromPath(row.filepath, name);
        if( result ) {
          let updateQuery = `
            SELECT ${this.schema}.add_partition_key($1, $2, $3)
          `;
          await dbClient.query(updateQuery, [row.file_id, result.value, name]);
        }
      }

      // emit progress callbacks
      completed += rows.length;
      if( opts.cb ) {
        opts.cb({total, completed});
      }
    }

    await batchDbClient.end();
  }

  // async remove(name) {
  //   let result = await super.remove(name);
  //   if( result.rows.length === 0 ) return;
  //   let autoPathPartitionId = result.rows[0].auto_path_partition_id;

  //   await this.dbClient.query(`
  //     DELETE FROM ${this.schema}.partition_key WHERE auto_path_partition_id = $1
  //   `, [autoPathPartitionId]);
  // }

}

export default AutoPathPartition;