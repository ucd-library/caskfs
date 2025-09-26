import { Client, Pool } from 'pg'
import fs from 'fs/promises';
import config from './config.js';
import path from 'path';

let __dirname = path.dirname(new URL(import.meta.url).pathname);

class PgClient {
  constructor(opts={}) {
    this.opts = opts;

    if( opts.pool ) {
      this.client = new Pool({
        host: config.postgres.host,
        port: config.postgres.port,
        user: config.postgres.user,
        password: config.postgres.password,
        database: config.postgres.database
      });
    } else {
      this.client = new Client({
        host: config.postgres.host,
        port: config.postgres.port,
        user: config.postgres.user,
        password: config.postgres.password,
        database: config.postgres.database
      });
    }

    this.initFiles = [
      'config.sql',
      'layer1-cas.sql',
      'layer2-fs.sql',
      'layer3-rdf.sql'
    ]
  }

  async connect(cb) {
    if (this.connected) {
      return; // Already connected
    }
    if( this.connecting ) {
      return this.connecting; // Already connecting
    }

    this.connecting = this.client.connect();

    this.client.on('close', () => {
      this.connected = false;
      this.connecting = null;
      if( cb ) cb('close');
    });

    this.client.on('error', (err) => {
      this.connected = false;
      this.connecting = null;
      if( cb ) {
        return cb('error', err);
      } else {
        throw new Error(`Postgres client error: ${err.message}`);
      }
    });

    await this.connecting;
    this.connecting = null;
    this.connected = true;
  }

  async init() {
    console.log(`Initializing CASKFS schema in PostgreSQL database`);

    for( let file of this.initFiles ) {
      let filePath = path.resolve(__dirname, '..', 'schema', file);
      console.log(`  - executing ${file}`);
      await this.queryFromFile(filePath);
    }

    console.log('CASKFS schema initialized');
  }

  async queryFromFile(filePath) {
    await this.connect();
    const queryText = await fs.readFile(filePath, 'utf8');
    return this.client.query(queryText);
  }

  async query(text, params) {
    await this.connect();
    return this.client.query(text, params);
  }

  async end() {
    await this.client.end();
  }

}

export default PgClient;