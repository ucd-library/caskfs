import assert from 'assert';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { setup as httpSetup, teardown as httpTeardown } from './helpers/http-setup.js';
import { setup as directSetup, teardown as directTeardown } from './helpers/setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASK_BIN  = path.resolve(__dirname, '..', 'src', 'bin', 'cask.js');

/**
 * @function runCask
 * @description Spawn a cask CLI subprocess and collect stdout/stderr.
 * @param {String[]} args
 * @param {Object} [opts={}]
 * @param {Object} [opts.env]
 * @returns {Promise<{code: Number, stdout: String, stderr: String}>}
 */
function runCask(args, opts={}) {
  return new Promise((resolve) => {
    const env   = { ...process.env, ...(opts.env || {}) };
    const child = spawn(process.execPath, [CASK_BIN, ...args], { env });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Shared test-data builder
// ---------------------------------------------------------------------------

/**
 * @function createTestTree
 * @description Create a small directory tree for copy tests.
 *   <root>/
 *     file1.txt  — "Content of file1"
 *     file2.txt  — "Content of file2"
 *     subdir/
 *       file3.txt — "Content of file3"
 *
 * @param {String} root - absolute path for the tree root
 * @returns {Promise<void>}
 */
async function createTestTree(root) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'file1.txt'), 'Content of file1');
  await fs.writeFile(path.join(root, 'file2.txt'), 'Content of file2');
  await fs.mkdir(path.join(root, 'subdir'), { recursive: true });
  await fs.writeFile(path.join(root, 'subdir', 'file3.txt'), 'Content of file3');
}

// ---------------------------------------------------------------------------
// Direct-pg mode
// ---------------------------------------------------------------------------

describe('CLI – cp (direct-pg)', () => {
  let caskFs;
  let envFile;
  let tmpDir;
  let dataDir;
  let singleFile;

  before(async () => {
    caskFs  = await directSetup();
    tmpDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'cask-cp-direct-'));
    envFile = path.join(tmpDir, 'environments.json');

    dataDir    = path.join(tmpDir, 'data');
    singleFile = path.join(tmpDir, 'single.txt');

    await createTestTree(dataDir);
    await fs.writeFile(singleFile, 'Single file content');

    const envData = {
      defaultEnvironment: 'test',
      environments: {
        test: {
          type:     'direct-pg',
          host:     process.env.CASKFS_PG_HOST     || 'localhost',
          port:     parseInt(process.env.CASKFS_PG_PORT || '5432'),
          user:     process.env.CASKFS_PG_USER     || 'postgres',
          password: process.env.CASKFS_PG_PASSWORD || 'postgres',
          database: process.env.CASKFS_PG_DATABASE || 'testing_caskfs_db',
          rootDir:  caskFs.rootDir,
        }
      }
    };
    await fs.writeFile(envFile, JSON.stringify(envData, null, 2));
  });

  after(async () => {
    await directTeardown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * @function env
   * @description Build env vars for CLI subprocesses.
   * @returns {Object}
   */
  function env() {
    return {
      CASKFS_ENV_FILE:    envFile,
      CASKFS_ACL_ENABLED: 'false',
      CASKFS_LOG_LEVEL:   'error',
    };
  }

  it('should copy a single file', async () => {
    const { code, stderr } = await runCask(
      ['cp', singleFile, '/cp-single/'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp exited non-zero: ${stderr}`);
  });

  it('should read back the single copied file', async () => {
    const { code, stdout, stderr } = await runCask(
      ['read', '/cp-single/single.txt'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `read exited non-zero: ${stderr}`);
    assert.ok(stdout.includes('Single file content'), `unexpected content:\n${stdout}`);
  });

  it('should copy a directory recursively', async () => {
    const { code, stdout, stderr } = await runCask(
      ['cp', dataDir, '/cp-dir/', '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp dir exited non-zero: ${stderr}`);
    assert.ok(stdout.includes('files processed'), `expected summary in output:\n${stdout}`);
    assert.ok(stdout.includes('files inserted'),  `expected inserted count in output:\n${stdout}`);
  });

  it('should read back all files from the copied directory', async () => {
    const cases = [
      ['/cp-dir/file1.txt',        'Content of file1'],
      ['/cp-dir/file2.txt',        'Content of file2'],
      ['/cp-dir/subdir/file3.txt', 'Content of file3'],
    ];
    for (const [filePath, expected] of cases) {
      const { code, stdout, stderr } = await runCask(['read', filePath], { env: env() });
      assert.strictEqual(code, 0, `read ${filePath} exited non-zero: ${stderr}`);
      assert.ok(stdout.includes(expected), `expected "${expected}" in output for ${filePath}:\n${stdout}`);
    }
  });

  it('should report no changes when copying the same directory again', async () => {
    const { code, stdout, stderr } = await runCask(
      ['cp', dataDir, '/cp-dir/', '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `second cp exited non-zero: ${stderr}`);
    assert.ok(stdout.includes('no changes'), `expected "no changes" in output:\n${stdout}`);
  });

  it('should overwrite an existing file with -x', async () => {
    const updatedFile = path.join(tmpDir, 'updated.txt');
    await fs.writeFile(updatedFile, 'Updated single content');

    // Write the original under /cp-replace/ first
    await runCask(['cp', singleFile, '/cp-replace/'], { env: env() });

    // Now overwrite with -x
    const { code, stderr } = await runCask(
      ['cp', updatedFile, '/cp-replace/', '-x'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp -x exited non-zero: ${stderr}`);

    const { stdout } = await runCask(['read', '/cp-replace/updated.txt'], { env: env() });
    assert.ok(stdout.includes('Updated single content'), `expected updated content:\n${stdout}`);
  });
});

// ---------------------------------------------------------------------------
// HTTP mode
// ---------------------------------------------------------------------------

describe('CLI – cp (http)', () => {
  let caskFs;
  let baseUrl;
  let envFile;
  let tmpDir;
  let dataDir;
  let singleFile;

  before(async () => {
    ({ caskFs, baseUrl } = await httpSetup());
    tmpDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'cask-cp-http-'));
    envFile = path.join(tmpDir, 'environments.json');

    dataDir    = path.join(tmpDir, 'data');
    singleFile = path.join(tmpDir, 'single.txt');

    await createTestTree(dataDir);
    await fs.writeFile(singleFile, 'Single file content');

    const baseUrlObj = new URL(baseUrl);
    const httpHost   = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
    const httpPath   = baseUrlObj.pathname;

    const envData = {
      defaultEnvironment: 'http-test',
      environments: {
        'http-test': {
          type: 'http',
          host: httpHost,
          path: httpPath,
        }
      }
    };
    await fs.writeFile(envFile, JSON.stringify(envData, null, 2));
  });

  after(async () => {
    await httpTeardown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * @function env
   * @description Build env vars for CLI subprocesses.
   * @returns {Object}
   */
  function env() {
    return {
      CASKFS_ENV_FILE:    envFile,
      CASKFS_ACL_ENABLED: 'false',
      CASKFS_LOG_LEVEL:   'error',
    };
  }

  it('should copy a single file (http)', async () => {
    const { code, stderr } = await runCask(
      ['cp', singleFile, '/cp-single/'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp exited non-zero: ${stderr}`);
  });

  it('should read back the single copied file (http)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['read', '/cp-single/single.txt'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `read exited non-zero: ${stderr}`);
    assert.ok(stdout.includes('Single file content'), `unexpected content:\n${stdout}`);
  });

  it('should copy a directory recursively (http)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['cp', dataDir, '/cp-dir/', '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp dir exited non-zero: ${stderr}`);
    assert.ok(stdout.includes('files processed'), `expected summary in output:\n${stdout}`);
    assert.ok(stdout.includes('files inserted'),  `expected inserted count in output:\n${stdout}`);
  });

  it('should read back all files from the copied directory (http)', async () => {
    const cases = [
      ['/cp-dir/file1.txt',        'Content of file1'],
      ['/cp-dir/file2.txt',        'Content of file2'],
      ['/cp-dir/subdir/file3.txt', 'Content of file3'],
    ];
    for (const [filePath, expected] of cases) {
      const { code, stdout, stderr } = await runCask(['read', filePath], { env: env() });
      assert.strictEqual(code, 0, `read ${filePath} exited non-zero: ${stderr}`);
      assert.ok(stdout.includes(expected), `expected "${expected}" in output for ${filePath}:\n${stdout}`);
    }
  });

  it('should report no changes when copying the same directory again (http)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['cp', dataDir, '/cp-dir/', '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `second cp exited non-zero: ${stderr}`);
    assert.ok(stdout.includes('no changes'), `expected "no changes" in output:\n${stdout}`);
  });

  it('should overwrite an existing file with -x (http)', async () => {
    const updatedFile = path.join(tmpDir, 'updated.txt');
    await fs.writeFile(updatedFile, 'Updated single content');

    // Write the original under /cp-replace/ first
    await runCask(['cp', singleFile, '/cp-replace/'], { env: env() });

    // Now overwrite with -x
    const { code, stderr } = await runCask(
      ['cp', updatedFile, '/cp-replace/', '-x'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp -x exited non-zero: ${stderr}`);

    const { stdout } = await runCask(['read', '/cp-replace/updated.txt'], { env: env() });
    assert.ok(stdout.includes('Updated single content'), `expected updated content:\n${stdout}`);
  });
});
