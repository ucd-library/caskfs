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

/**
 * @function runAclCliFlow
 * @description Exercise the full `cask acl` command surface end-to-end (both direct-pg and
 * http modes run this same flow). ACL enforcement is disabled for these CLI tests (see env()
 * in each mode below), so every command should succeed unconditionally - this flow proves the
 * commands are wired correctly, not that admin-gating works (that's covered at the
 * library/HTTP-controller level in tests/acl-admin.test.js and tests/acl-http.test.js).
 *
 * @param {Object} env - env vars for the CLI subprocess (from the caller's env() helper)
 * @param {String} dataFile - local file path to write as the fixture file
 * @returns {Promise<void>}
 */
async function runAclCliFlow(env, dataFile) {
  const role = 'cli-test-role';
  const user = 'cli-test-user';
  const dir  = '/acl-cli-test';

  let r = await runCask(['write', `${dir}/fixture.txt`, '-d', dataFile], { env });
  assert.strictEqual(r.code, 0, `fixture write failed: ${r.stderr}`);

  r = await runCask(['acl', 'role-add', role], { env });
  assert.strictEqual(r.code, 0, `role-add failed: ${r.stderr}`);

  r = await runCask(['acl', 'role-list'], { env });
  assert.strictEqual(r.code, 0, `role-list failed: ${r.stderr}`);
  assert.ok(r.stdout.includes(role), `expected ${role} in role-list output:\n${r.stdout}`);

  r = await runCask(['acl', 'user-add', user], { env });
  assert.strictEqual(r.code, 0, `user-add failed: ${r.stderr}`);

  r = await runCask(['acl', 'user-list'], { env });
  assert.strictEqual(r.code, 0, `user-list failed: ${r.stderr}`);
  assert.ok(r.stdout.includes(user), `expected ${user} in user-list output:\n${r.stdout}`);

  r = await runCask(['acl', 'user-role-set', user, role], { env });
  assert.strictEqual(r.code, 0, `user-role-set failed: ${r.stderr}`);

  r = await runCask(['acl', 'user-role-get', '--user', user], { env });
  assert.strictEqual(r.code, 0, `user-role-get --user failed: ${r.stderr}`);
  assert.ok(r.stdout.includes(role), `expected ${role} in user-role-get output:\n${r.stdout}`);

  r = await runCask(['acl', 'user-role-get', '--role', role], { env });
  assert.strictEqual(r.code, 0, `user-role-get --role failed: ${r.stderr}`);
  assert.ok(r.stdout.includes(user), `expected ${user} in user-role-get output:\n${r.stdout}`);

  r = await runCask(['acl', 'permission-set', dir, role, 'read'], { env });
  assert.strictEqual(r.code, 0, `permission-set failed: ${r.stderr}`);

  r = await runCask(['acl', 'get', dir], { env });
  assert.strictEqual(r.code, 0, `get failed: ${r.stderr}`);
  assert.ok(r.stdout.includes(role), `expected ${role} in get output:\n${r.stdout}`);

  r = await runCask(['acl', 'public-set', dir, 'true'], { env });
  assert.strictEqual(r.code, 0, `public-set failed: ${r.stderr}`);

  r = await runCask(['acl', 'test', dir, user, 'read'], { env });
  assert.strictEqual(r.code, 0, `test failed: ${r.stderr}`);
  assert.strictEqual(r.stdout.trim(), 'true', `expected 'true' from acl test:\n${r.stdout}`);

  r = await runCask(['acl', 'test', dir, user, 'write'], { env });
  assert.strictEqual(r.code, 0, `test (write) failed: ${r.stderr}`);
  assert.strictEqual(r.stdout.trim(), 'false', `expected 'false' from acl test (write):\n${r.stdout}`);

  r = await runCask(['acl', 'permission-remove', dir, role, 'read'], { env });
  assert.strictEqual(r.code, 0, `permission-remove failed: ${r.stderr}`);

  // Direct user grant (--type user), bypassing roles entirely - the role-based read
  // permission was just removed above, so this proves the direct grant works on its own.
  r = await runCask(['acl', 'permission-set', dir, user, 'read', '--type', 'user'], { env });
  assert.strictEqual(r.code, 0, `permission-set --type user failed: ${r.stderr}`);

  r = await runCask(['acl', 'test', dir, user, 'read'], { env });
  assert.strictEqual(r.code, 0, `test (direct user grant) failed: ${r.stderr}`);
  assert.strictEqual(r.stdout.trim(), 'true', `expected 'true' from acl test after direct user grant:\n${r.stdout}`);

  r = await runCask(['acl', 'permission-remove', dir, user, 'read', '--type', 'user'], { env });
  assert.strictEqual(r.code, 0, `permission-remove --type user failed: ${r.stderr}`);

  r = await runCask(['acl', 'remove', dir], { env });
  assert.strictEqual(r.code, 0, `remove failed: ${r.stderr}`);

  r = await runCask(['acl', 'user-role-remove', user, role], { env });
  assert.strictEqual(r.code, 0, `user-role-remove failed: ${r.stderr}`);

  r = await runCask(['acl', 'user-remove', user], { env });
  assert.strictEqual(r.code, 0, `user-remove failed: ${r.stderr}`);

  r = await runCask(['acl', 'role-remove', role], { env });
  assert.strictEqual(r.code, 0, `role-remove failed: ${r.stderr}`);
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

    // Write a minimal direct-pg environment pointing at the test database.
    // rootDir must match the CaskFs instance so the CLI subprocess writes CAS
    // files to the same location the test instance uses.
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
          rootDir: caskFs.rootDir,
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

  it('should record a lineage link via --derived-from on write', async () => {
    const { code: bronzeCode, stderr: bronzeErr } = await runCask(
      ['write', '/cli-test/bronze.txt', '-d', dataFile],
      { env: env() }
    );
    assert.strictEqual(bronzeCode, 0, `bronze write exited non-zero. stderr: ${bronzeErr}`);

    const { code, stdout, stderr } = await runCask(
      ['write', '/cli-test/silver.txt', '-d', dataFile, '--derived-from', '/cli-test/bronze.txt'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `write --derived-from exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('Lineage:'), `expected lineage confirmation in output:\n${stdout}`);

    const { code: srcCode, stdout: srcOut } = await runCask(
      ['lineage', 'sources', '/cli-test/silver.txt'],
      { env: env() }
    );
    assert.strictEqual(srcCode, 0);
    assert.ok(srcOut.includes('/cli-test/bronze.txt'), `expected source path in lineage output:\n${srcOut}`);
  });

  it('should delete the file via cask rm', async () => {
    const { code, stderr } = await runCask(
      ['rm', TEST_FILE_PATH],
      { env: env() }
    );
    assert.strictEqual(code, 0, `rm exited non-zero. stderr: ${stderr}`);
  });

  it('should error via cask rm on an already-deleted file without --ignore-missing', async () => {
    const { code, stderr } = await runCask(
      ['rm', TEST_FILE_PATH],
      { env: env() }
    );
    assert.notStrictEqual(code, 0, 'rm should exit non-zero for a missing file');
    assert.ok(stderr.includes('MissingResource'), `expected MissingResource error in stderr:\n${stderr}`);
  });

  it('should no-op via cask rm --ignore-missing on an already-deleted file', async () => {
    const { code, stdout, stderr } = await runCask(
      ['rm', TEST_FILE_PATH, '--ignore-missing'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `rm --ignore-missing exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('No-op'), `expected No-op message in stdout:\n${stdout}`);
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

  describe('archive export/import (direct-pg)', () => {
    let archiveFile;

    before(async () => {
      archiveFile = path.join(tmpDir, 'direct-pg-export.tar.gz');

      // Write a test file to export
      const { code, stderr } = await runCask(
        ['write', '/archive-test/hello.txt', '-d', dataFile],
        { env: env() }
      );
      assert.strictEqual(code, 0, `setup write failed: ${stderr}`);
    });

    it('should export files to a .tar.gz archive', async () => {
      const { code, stderr } = await runCask(
        ['archive', 'export', '/', archiveFile, '-y'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `export failed: ${stderr}`);
      const stat = await fs.stat(archiveFile);
      assert.ok(stat.size > 0, 'archive should not be empty');
    });

    it('should import the archive and restore all files', async () => {
      // Wipe DB and CAS so the import has to do real work
      await caskFs.powerWash();
      await fs.rm(path.join(caskFs.rootDir, 'cas'), { recursive: true, force: true });

      const { code, stderr } = await runCask(
        ['archive', 'import', archiveFile],
        { env: env() }
      );
      assert.strictEqual(code, 0, `import failed: ${stderr}`);

      // Verify the restored file is readable
      const { code: readCode, stdout } = await runCask(
        ['read', '/archive-test/hello.txt'],
        { env: env() }
      );
      assert.strictEqual(readCode, 0);
      assert.ok(stdout.includes(TEST_CONTENT), `expected file content in read output:\n${stdout}`);
    });

    it('should report files inserted in import summary', async () => {
      // Fresh import into the just-restored DB (overwrite mode)
      const { code, stdout, stderr } = await runCask(
        ['archive', 'import', archiveFile, '--overwrite'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `import --overwrite failed: ${stderr}`);
      assert.ok(
        stdout.includes('files processed') || stdout.includes('files inserted'),
        `expected summary in output:\n${stdout}`
      );
    });
  });

  describe('acl commands (direct-pg)', () => {
    it('should run the full acl CLI flow', async () => {
      await runAclCliFlow(env(), dataFile);
    });
  });

  describe('admin cleanup-ld (direct-pg)', () => {
    it('should print an overview with --dry-run and not prompt for confirmation', async () => {
      const { code, stdout, stderr } = await runCask(
        ['admin', 'cleanup-ld', '--dry-run'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `cleanup-ld --dry-run exited non-zero. stderr: ${stderr}`);
      assert.ok(stdout.includes('ld_filter:'), `expected ld_filter count in output:\n${stdout}`);
      assert.ok(stdout.includes('ld_link:'), `expected ld_link count in output:\n${stdout}`);
      assert.ok(stdout.includes('ld_literal:'), `expected ld_literal count in output:\n${stdout}`);
      assert.ok(stdout.includes('uri'), `expected uri count in output:\n${stdout}`);
    });

    it('should abort without deleting when the confirmation prompt is answered no, and skip the overview query', async () => {
      const { code, stdout, stderr } = await runCask(
        ['admin', 'cleanup-ld'],
        { env: env(), stdin: 'no\n' }
      );
      assert.strictEqual(code, 0, `cleanup-ld exited non-zero. stderr: ${stderr}`);
      assert.ok(stdout.includes('Cleanup aborted'), `expected abort message in output:\n${stdout}`);
      assert.ok(!stdout.includes('ld_filter:'), `overview should not be computed on the confirm path:\n${stdout}`);
      assert.ok(!stdout.includes('ld_link:'), `overview should not be computed on the confirm path:\n${stdout}`);
      assert.ok(!stdout.includes('ld_literal:'), `overview should not be computed on the confirm path:\n${stdout}`);
    });

    it('should delete unused rows with -y and report a summary', async () => {
      const { code, stdout, stderr } = await runCask(
        ['admin', 'cleanup-ld', '-y', '--batch-size', '10'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `cleanup-ld -y exited non-zero. stderr: ${stderr}`);
      assert.ok(stdout.includes('Deleted'), `expected a Deleted summary line in output:\n${stdout}`);
    });

    it('should run cleanup with --vacuum-full without error', async () => {
      const { code, stdout, stderr } = await runCask(
        ['admin', 'cleanup-ld', '-y', '--vacuum-full'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `cleanup-ld --vacuum-full exited non-zero. stderr: ${stderr}`);
      assert.ok(stdout.includes('Vacuum complete'), `expected vacuum completion message in output:\n${stdout}`);
    });
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

  it('should no-op via cask rm --ignore-missing on an already-deleted file (http mode)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['rm', TEST_FILE_PATH, '--ignore-missing'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `rm --ignore-missing exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('No-op'), `expected No-op message in stdout:\n${stdout}`);
  });

  it('should no-op via cask rm -d --ignore-missing on a non-existent directory (http mode)', async () => {
    const { code, stdout, stderr } = await runCask(
      ['rm', '-d', '/no-such-http-directory', '--ignore-missing'],
      { env: env() }
    );
    assert.strictEqual(code, 0, `rm -d --ignore-missing exited non-zero. stderr: ${stderr}`);
    assert.ok(stdout.includes('No-op'), `expected No-op message in stdout:\n${stdout}`);
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

  describe('archive export/import (http)', () => {
    let archiveFile;

    before(async () => {
      archiveFile = path.join(tmpDir, 'http-export.tar.gz');

      // Write a test file to export
      const { code, stderr } = await runCask(
        ['write', '/archive-test/hello.txt', '-d', dataFile],
        { env: env() }
      );
      assert.strictEqual(code, 0, `setup write failed: ${stderr}`);
    });

    it('should export files to a .tar.gz archive via HTTP', async () => {
      const { code, stderr } = await runCask(
        ['archive', 'export', '/', archiveFile, '-y'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `export failed: ${stderr}`);
      const stat = await fs.stat(archiveFile);
      assert.ok(stat.size > 0, 'archive should not be empty');
    });

    it('should import the archive and restore all files via HTTP', async () => {
      // Wipe server-side DB and CAS so the import has to upload content
      await caskFs.powerWash();
      await fs.rm(path.join(caskFs.rootDir, 'cas'), { recursive: true, force: true });

      const { code, stderr } = await runCask(
        ['archive', 'import', archiveFile],
        { env: env() }
      );
      assert.strictEqual(code, 0, `import failed: ${stderr}`);

      // Verify the restored file is readable via HTTP
      const { code: readCode, stdout } = await runCask(
        ['read', '/archive-test/hello.txt'],
        { env: env() }
      );
      assert.strictEqual(readCode, 0);
      assert.ok(stdout.includes(TEST_CONTENT), `expected file content in read output:\n${stdout}`);
    });

    it('should report hashes uploaded in import summary', async () => {
      // Re-import with overwrite — content is already on server so hashesUploaded=0
      const { code, stdout, stderr } = await runCask(
        ['archive', 'import', archiveFile, '--overwrite'],
        { env: env() }
      );
      assert.strictEqual(code, 0, `import --overwrite failed: ${stderr}`);
      assert.ok(
        stdout.includes('files processed') || stdout.includes('files inserted'),
        `expected summary in output:\n${stdout}`
      );
    });
  });

  describe('acl commands (http)', () => {
    it('should run the full acl CLI flow', async () => {
      await runAclCliFlow(env(), dataFile);
    });
  });
});
