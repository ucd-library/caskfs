import assert from 'assert';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { setup as httpSetup, teardown as httpTeardown } from './helpers/http-setup.js';
import { setup as directSetup, teardown as directTeardown } from './helpers/setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASK_BIN = path.resolve(__dirname, '..', 'src', 'bin', 'cask.js');

const TEST_FILE_PATH = '/cli-test/hello.txt';
const TEST_CONTENT   = 'Hello from CLI test!';

/**
 * @function runCask
 * @description Spawn a cask CLI subprocess and collect stdout/stderr.
 * @param {String[]} args - CLI arguments
 * @param {Object} [opts={}]
 * @param {Object} [opts.env] - Extra environment variables
 * @param {String} [opts.stdin] - String to write to stdin
 * @returns {Promise<{code: Number, stdout: String, stderr: String}>}
 */
function runCask(args, opts={}) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...(opts.env || {}) };
    const child = spawn(process.execPath, [CASK_BIN, ...args], { env });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    if (opts.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Direct-PG mode CLI tests
// ---------------------------------------------------------------------------

describe('CLI – direct-pg mode', () => {
  let caskFs;
  let envFile;
  let tmpDir;
  let dataFile;

  before(async () => {
    caskFs  = await directSetup();
    tmpDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'cask-cli-test-'));
    envFile = path.join(tmpDir, 'environments.json');
    dataFile = path.join(tmpDir, 'hello.txt');

    await fs.writeFile(dataFile, TEST_CONTENT, 'utf-8');

    // Write a minimal direct-pg environment pointing at the test database
    const envData = {
      defaultEnvironment: 'test',
      environments: {
        test: {
          type: 'direct-pg',
          host: process.env.CASKFS_PG_HOST || 'localhost',
          port: parseInt(process.env.CASKFS_PG_PORT || '5432'),
          user: process.env.CASKFS_PG_USER || 'postgres',
          password: process.env.CASKFS_PG_PASSWORD || 'postgres',
          database: process.env.CASKFS_PG_DATABASE || 'testing_caskfs_db',
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
      CASKFS_ENV_FILE: envFile,
      CASKFS_ACL_ENABLED: 'false',
      CASKFS_LOG_LEVEL: 'error',
    };
  }

  it('should write a file via CLI', async () => {
    const { code, stderr } = await runCask(
      ['write', TEST_FILE_PATH, '-d', dataFile],
      { env: env() }
    );
    assert.strictEqual(code, 0, `write exited non-zero. stderr: ${stderr}`);
  });

  it('should list the file via cask ls', async () => {
    const { code, stdout, stderr } = await runCask(
      ['ls', '/cli-test'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `ls exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('hello.txt'), `expected hello.txt in ls output:\n${stdout}`);
  });

  it('should read the file via cask read', async () => {
    const { code, stdout, stderr } = await runCask(
      ['read', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `read exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes(TEST_CONTENT), `expected content in read output:\n${stdout}`);
  });

  it('should output metadata via cask metadata', async () => {
    const { code, stdout, stderr } = await runCask(
      ['metadata', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `metadata exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('hello.txt'), `expected filename in metadata output:\n${stdout}`);
  });

  it('should delete the file via cask rm', async () => {
    const { code, stderr } = await runCask(
      ['rm', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `rm exited non-zero. stderr: ${stderr}`);
  });

  it('should show connection info via cask info', async () => {
    const { code, stdout, stderr } = await runCask(
      ['info'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `info exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('direct-pg'), `expected direct-pg in info output:\n${stdout}`);
    assert.ok(stdout.includes('test'), `expected env name in info output:\n${stdout}`);
  });
});

// ---------------------------------------------------------------------------
// HTTP mode CLI tests
// ---------------------------------------------------------------------------

describe('CLI – http mode', () => {
  let caskFs;
  let baseUrl;
  let envFile;
  let tmpDir;
  let dataFile;

  before(async () => {
    ({ caskFs, baseUrl } = await httpSetup());
    tmpDir   = await fs.mkdtemp(path.join(os.tmpdir(), 'cask-cli-http-test-'));
    envFile  = path.join(tmpDir, 'environments.json');
    dataFile = path.join(tmpDir, 'hello.txt');

    await fs.writeFile(dataFile, TEST_CONTENT, 'utf-8');

    // baseUrl is http://localhost:PORT/api — split into host + path for the env config
    const baseUrlObj = new URL(baseUrl);
    const httpHost = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
    const httpPath = baseUrlObj.pathname;

    // Write an http environment pointing at the test server
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
      CASKFS_ENV_FILE: envFile,
      CASKFS_ACL_ENABLED: 'false',
      CASKFS_LOG_LEVEL: 'error',
    };
  }

  it('should write a file via CLI (http mode)', async () => {
    const { code, stderr } = await runCask(
      ['write', TEST_FILE_PATH, '-d', dataFile],
      { env: env() }
    );
    assert.strictEqual(code, 0, `write exited non-zero. stderr: ${stderr}`);
  });

  it('should list the file via cask ls (http mode)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['ls', '/cli-test'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `ls exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('hello.txt'), `expected hello.txt in ls output:\n${stdout}`);
  });

  it('should read the file via cask read (http mode)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['read', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `read exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes(TEST_CONTENT), `expected content in read output:\n${stdout}`);
  });

  it('should output metadata via cask metadata (http mode)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['metadata', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `metadata exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('hello.txt'), `expected filename in metadata output:\n${stdout}`);
  });

  it('should delete the file via cask rm (http mode)', async () => {
    const { code, stderr } = await runCask(
      ['rm', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `rm exited non-zero. stderr: ${stderr}`);
  });

  it('should show connection info via cask info (http mode)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['info'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `info exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('http'), `expected http in info output:\n${stdout}`);
    assert.ok(stdout.includes('http-test'), `expected env name in info output:\n${stdout}`);
  });

  it('should reject direct-pg-only commands with a clear error (http mode)', async () => {
    const { code, stderr } = await runCask(
      ['init-pg'],
      { env: env() }
    );
    assert.notStrictEqual(code, 0, 'init-pg should fail in http mode');
    assert.ok(
      stderr.includes('direct-pg') || stderr.includes('init-pg'),
      `expected direct-pg error in stderr:\n${stderr}`
    );
  });
});
