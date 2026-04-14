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

  it('should upload a __file__ sentinel as the CaskFS file at the directory path', async () => {
    // Build: sentinelDir/doc.pdf/__file__.pdf  +  sentinelDir/doc.pdf/child.txt
    const sentinelRoot = path.join(tmpDir, 'sentinelDir');
    const docDir       = path.join(sentinelRoot, 'doc.pdf');
    await fs.mkdir(docDir, { recursive: true });
    await fs.writeFile(path.join(docDir, '__file__.pdf'), 'PDF sentinel content');
    await fs.writeFile(path.join(docDir, 'child.txt'),   'Child file content');

    const { code, stderr } = await runCask(
      ['cp', sentinelRoot, '/cp-sentinel/', '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp sentinel exited non-zero: ${stderr}`);

    // The sentinel should be readable at /cp-sentinel/doc.pdf
    const { code: r1, stdout: s1 } = await runCask(['read', '/cp-sentinel/doc.pdf'], { env: env() });
    assert.strictEqual(r1, 0, 'read sentinel file exited non-zero');
    assert.ok(s1.includes('PDF sentinel content'), `unexpected content: ${s1}`);

    // The child file should be at /cp-sentinel/doc.pdf/child.txt
    const { code: r2, stdout: s2 } = await runCask(['read', '/cp-sentinel/doc.pdf/child.txt'], { env: env() });
    assert.strictEqual(r2, 0, 'read child file exited non-zero');
    assert.ok(s2.includes('Child file content'), `unexpected content: ${s2}`);
  });

  it('should exit non-zero when multiple sentinels exist in one directory', async () => {
    const badDir = path.join(tmpDir, 'badSentinel');
    const subDir = path.join(badDir, 'report.pdf');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, '__file__.pdf'), 'one');
    await fs.writeFile(path.join(subDir, '__file__.txt'), 'two');

    const { code } = await runCask(
      ['cp', badDir, '/cp-bad-sentinel/', '-y'],
      { env: env() }
    );
    assert.notStrictEqual(code, 0, 'expected non-zero exit for multiple sentinels');
  });

  it('should download a directory from CaskFS to local', async () => {
    // dataDir was uploaded to /cp-dir/ in earlier tests — re-use it
    const dlDir = path.join(tmpDir, 'downloaded');
    await fs.mkdir(dlDir, { recursive: true });

    const { code, stderr } = await runCask(
      ['cp', 'cask:/cp-dir', dlDir, '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cask→local exited non-zero: ${stderr}`);

    const f1 = await fs.readFile(path.join(dlDir, 'file1.txt'), 'utf-8');
    assert.ok(f1.includes('Content of file1'), `unexpected file1 content: ${f1}`);

    const f3 = await fs.readFile(path.join(dlDir, 'subdir', 'file3.txt'), 'utf-8');
    assert.ok(f3.includes('Content of file3'), `unexpected file3 content: ${f3}`);
  });

  it('should download a single file from CaskFS to local', async () => {
    const dlSingle = path.join(tmpDir, 'dl-single');
    await fs.mkdir(dlSingle, { recursive: true });

    const { code, stderr } = await runCask(
      ['cp', 'cask:/cp-single/single.txt', dlSingle],
      { env: env() }
    );
    assert.strictEqual(code, 0, `single file download exited non-zero: ${stderr}`);

    const content = await fs.readFile(path.join(dlSingle, 'single.txt'), 'utf-8');
    assert.ok(content.includes('Single file content'), `unexpected content: ${content}`);
  });

  it('should create __file__ sentinel when downloading a virtual dir from CaskFS', async () => {
    // Set up a virtual dir: write a file at /cp-vdir/doc.pdf AND a child at /cp-vdir/doc.pdf/child.txt
    await runCask(['write', '/cp-vdir/doc.pdf',            '-d', singleFile], { env: env() });
    await runCask(['write', '/cp-vdir/doc.pdf/child.txt',  '-d', singleFile], { env: env() });

    const dlVdir = path.join(tmpDir, 'dl-vdir');
    await fs.mkdir(dlVdir, { recursive: true });

    const { code, stderr } = await runCask(
      ['cp', 'cask:/cp-vdir', dlVdir, '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `virtual dir download exited non-zero: ${stderr}`);

    // The virtual dir file becomes a __file__.pdf sentinel inside a doc.pdf/ directory
    const sentinel = await fs.readFile(path.join(dlVdir, 'doc.pdf', '__file__.pdf'), 'utf-8');
    assert.ok(sentinel.length > 0, 'sentinel file should not be empty');

    // The child file lands normally
    const child = await fs.readFile(path.join(dlVdir, 'doc.pdf', 'child.txt'), 'utf-8');
    assert.ok(child.length > 0, 'child file should not be empty');
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

  it('should upload a __file__ sentinel as the CaskFS file at the directory path (http)', async () => {
    const sentinelRoot = path.join(tmpDir, 'sentinelDir');
    const docDir       = path.join(sentinelRoot, 'doc.pdf');
    await fs.mkdir(docDir, { recursive: true });
    await fs.writeFile(path.join(docDir, '__file__.pdf'), 'PDF sentinel content');
    await fs.writeFile(path.join(docDir, 'child.txt'),   'Child file content');

    const { code, stderr } = await runCask(
      ['cp', sentinelRoot, '/cp-sentinel/', '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cp sentinel exited non-zero: ${stderr}`);

    const { code: r1, stdout: s1 } = await runCask(['read', '/cp-sentinel/doc.pdf'], { env: env() });
    assert.strictEqual(r1, 0, 'read sentinel file exited non-zero');
    assert.ok(s1.includes('PDF sentinel content'), `unexpected content: ${s1}`);

    const { code: r2, stdout: s2 } = await runCask(['read', '/cp-sentinel/doc.pdf/child.txt'], { env: env() });
    assert.strictEqual(r2, 0, 'read child file exited non-zero');
    assert.ok(s2.includes('Child file content'), `unexpected content: ${s2}`);
  });

  it('should exit non-zero when multiple sentinels exist in one directory (http)', async () => {
    const badDir = path.join(tmpDir, 'badSentinel');
    const subDir = path.join(badDir, 'report.pdf');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, '__file__.pdf'), 'one');
    await fs.writeFile(path.join(subDir, '__file__.txt'), 'two');

    const { code } = await runCask(
      ['cp', badDir, '/cp-bad-sentinel/', '-y'],
      { env: env() }
    );
    assert.notStrictEqual(code, 0, 'expected non-zero exit for multiple sentinels');
  });

  it('should download a directory from CaskFS to local (http)', async () => {
    const dlDir = path.join(tmpDir, 'downloaded');
    await fs.mkdir(dlDir, { recursive: true });

    const { code, stderr } = await runCask(
      ['cp', 'cask:/cp-dir', dlDir, '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `cask→local exited non-zero: ${stderr}`);

    const f1 = await fs.readFile(path.join(dlDir, 'file1.txt'), 'utf-8');
    assert.ok(f1.includes('Content of file1'), `unexpected file1 content: ${f1}`);

    const f3 = await fs.readFile(path.join(dlDir, 'subdir', 'file3.txt'), 'utf-8');
    assert.ok(f3.includes('Content of file3'), `unexpected file3 content: ${f3}`);
  });

  it('should download a single file from CaskFS to local (http)', async () => {
    const dlSingle = path.join(tmpDir, 'dl-single');
    await fs.mkdir(dlSingle, { recursive: true });

    const { code, stderr } = await runCask(
      ['cp', 'cask:/cp-single/single.txt', dlSingle],
      { env: env() }
    );
    assert.strictEqual(code, 0, `single file download exited non-zero: ${stderr}`);

    const content = await fs.readFile(path.join(dlSingle, 'single.txt'), 'utf-8');
    assert.ok(content.includes('Single file content'), `unexpected content: ${content}`);
  });

  it('should create __file__ sentinel when downloading a virtual dir from CaskFS (http)', async () => {
    await runCask(['write', '/cp-vdir/doc.pdf',            '-d', singleFile], { env: env() });
    await runCask(['write', '/cp-vdir/doc.pdf/child.txt',  '-d', singleFile], { env: env() });

    const dlVdir = path.join(tmpDir, 'dl-vdir');
    await fs.mkdir(dlVdir, { recursive: true });

    const { code, stderr } = await runCask(
      ['cp', 'cask:/cp-vdir', dlVdir, '-y'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `virtual dir download exited non-zero: ${stderr}`);

    const sentinel = await fs.readFile(path.join(dlVdir, 'doc.pdf', '__file__.pdf'), 'utf-8');
    assert.ok(sentinel.length > 0, 'sentinel file should not be empty');

    const child = await fs.readFile(path.join(dlVdir, 'doc.pdf', 'child.txt'), 'utf-8');
    assert.ok(child.length > 0, 'child file should not be empty');
  });
});
