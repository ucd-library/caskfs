import AutoPath from "./base.js";

class AutoPathPartition extends AutoPath {

  constructor(opts={}) {
    super({
      table : 'auto_path_partition',
      ...opts
    });
  }

  getValue(name, pathValue) {
    return name+'-'+pathValue;
  }

  async set(opts) {
    await super.set(opts);
    let name = opts.name;
    let dbClient = opts.dbClient || this.dbClient;

    await this.getConfig();

    let query = 'SELECT file_id, filepath FROM ' + this.schema + '.file';
    let batchDbClient = new Database({type: this.opts.dbType || config.database.client});

    // emit progress callbacks
    let total = 0;
    let completed = 0;
    if( opts.cb ) {
      let total = await dbClient.query(`count(*) as count FROM ${this.schema}.file`);
      total = total.rows[0].count;
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
  }

}

export default AutoPathPartition;