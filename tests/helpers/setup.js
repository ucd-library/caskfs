import CaskFs from '../../src/index.js';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

let testRootDir;
let caskFs;

export async function setup() {
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
