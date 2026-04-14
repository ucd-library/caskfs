import express from 'express';
import CaskFs from '../../src/index.js';
import config from '../../src/lib/config.js';
import { Client } from 'pg';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

let testRootDir;
let caskFs;
let server;

/**
 * @function ensureDatabase
 * @description Create the test database if it does not already exist.
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

/**
 * @function setup
 * @description Start a test HTTP server with a fresh CaskFS instance backed by a temp directory.
 * Sets config.rootDir so the controller singleton (which reads config.rootDir at call-time) uses
 * the same storage location as the test CaskFs instance.
 *
 * @returns {Promise<{caskFs: CaskFs, baseUrl: string}>}
 */
export async function setup() {
  await ensureDatabase();

  testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caskfs-http-test-'));

  caskFs = new CaskFs({ rootDir: testRootDir });

  // CaskFs constructor sets config.rootDir = testRootDir, so the controller singleton
  // will use this same path when it calls diskPath() during request handling.
  await caskFs.powerWash();

  const { caskRouter } = await import('../../src/client/index.js');

  const app = express();
  app.use('/', caskRouter({ disableWebApp: true, logRequests: false }));

  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = server.address().port;
  return {
    caskFs,
    baseUrl: `http://localhost:${port}/api`,
  };
}

/**
 * @function teardown
 * @description Stop the test HTTP server and clean up database and temp files.
 */
export async function teardown() {
  if (server) {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    server = null;
  }
  if (caskFs) {
    await caskFs.powerWash();
    await caskFs.dbClient.end();
  }
  if (testRootDir) {
    await fs.rm(testRootDir, { recursive: true, force: true });
  }
}
