import CaskFs from '../../src/index.js';
import { Client } from 'pg';
import config from '../../src/lib/config.js';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

let testRootDir;
let caskFs;

/**
 * @function ensureDatabase
 * @description Create the test database if it does not already exist.
 * Connects to the default 'postgres' database to issue CREATE DATABASE.
 */
async function ensureDatabase() {
  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: 'postgres'
  });
  await client.connect();
  const dbName = config.postgres.database;
  const res = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
  );
  if (res.rows.length === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }
  await client.end();
}

export async function setup() {
  await ensureDatabase();
  testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caskfs-test-'));

  caskFs = new CaskFs({
    rootDir: testRootDir,
  });

  // Drop and re-create the schema for a clean slate
  await caskFs.dbClient.powerWash();
  await caskFs.dbClient.init();

  return caskFs;
}

export async function teardown() {
  if (caskFs) {
    await caskFs.dbClient.powerWash();
    await caskFs.dbClient.end();
  }
  if (testRootDir) {
    await fs.rm(testRootDir, { recursive: true, force: true });
  }
}
