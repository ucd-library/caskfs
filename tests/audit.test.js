import assert from 'assert';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { setup, teardown } from './helpers/setup.js';
import { setup as httpSetup, teardown as httpTeardown } from './helpers/http-setup.js';
import config from '../src/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASK_BIN  = path.resolve(__dirname, '..', 'src', 'bin', 'cask.js');
const TEST_USER = 'test-user';

/**
 * @function getAuditRows
 * @description Query caskfs.audit_log (the partitioned parent - Postgres scans all
 * partitions transparently) for rows matching an operation, oldest first.
 */
async function getAuditRows(caskFs, operation) {
  const res = await caskFs.dbClient.query(
    `SELECT * FROM ${config.database.schema}.audit_log WHERE operation = $1 ORDER BY audit_log_id`,
    [operation]
  );
  return res.rows;
}

describe('audit log — disabled by default', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  it('should not write any audit rows when config.audit.enabled is false', async () => {
    assert.strictEqual(config.audit.enabled, false);
    await caskFs.write({
      filePath: '/audit-disabled/hello.txt',
      data: Buffer.from('hello'),
      requestor: TEST_USER,
      ignoreAcl: true
    });
    const rows = await getAuditRows(caskFs, 'file.write');
    assert.strictEqual(rows.length, 0);
  });
});

describe('audit log — enabled', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    config.audit.enabled = true;
  });

  after(async () => {
    config.audit.enabled = false;
    await teardown();
  });

  it('should record a file.write audit row with requestor, resourceId, resourcePath and ip', async () => {
    const result = await caskFs.write({
      filePath: '/audit/hello.txt',
      data: Buffer.from('hello world'),
      requestor: TEST_USER,
      ip: '10.0.0.5',
      ignoreAcl: true
    });

    const rows = await getAuditRows(caskFs, 'file.write');
    const row = rows.find(r => r.resource_path === '/audit/hello.txt');
    assert.ok(row, 'expected a file.write audit row for /audit/hello.txt');
    assert.strictEqual(row.requestor, TEST_USER);
    assert.strictEqual(row.resource_type, 'file');
    assert.strictEqual(row.resource_id, result.data.file.file_id);
    assert.strictEqual(row.ip_address, '10.0.0.5');
    assert.strictEqual(row.details.hash, result.data.file.hash_value);
  });

  it('should not record a second audit row for a no-op rewrite (identical content and metadata)', async () => {
    const before = (await getAuditRows(caskFs, 'file.write')).length;

    await caskFs.write({
      filePath: '/audit/hello.txt',
      data: Buffer.from('hello world'),
      requestor: TEST_USER,
      replace: true,
      ignoreAcl: true
    });

    const after = (await getAuditRows(caskFs, 'file.write')).length;
    assert.strictEqual(after, before, 'a dedup\'d no-op rewrite should not add a new audit row');
  });

  it('should record a file.write audit row when a rewrite actually changes the hash', async () => {
    const before = (await getAuditRows(caskFs, 'file.write')).length;

    await caskFs.write({
      filePath: '/audit/hello.txt',
      data: Buffer.from('a real change this time'),
      requestor: TEST_USER,
      replace: true,
      ignoreAcl: true
    });

    const after = (await getAuditRows(caskFs, 'file.write')).length;
    assert.strictEqual(after, before + 1);
  });

  it('should record a file.delete audit row', async () => {
    await caskFs.write({
      filePath: '/audit/to-delete.txt',
      data: Buffer.from('bye'),
      requestor: TEST_USER,
      ignoreAcl: true
    });

    await caskFs.deleteFile({ filePath: '/audit/to-delete.txt', requestor: TEST_USER, ignoreAcl: true });

    const rows = await getAuditRows(caskFs, 'file.delete');
    const row = rows.find(r => r.resource_path === '/audit/to-delete.txt');
    assert.ok(row, 'expected a file.delete audit row');
    assert.strictEqual(row.requestor, TEST_USER);
  });

  it('should record acl.ensure_role and acl.ensure_user audit rows', async () => {
    await caskFs.ensureRole({ role: 'audit-test-role', requestor: TEST_USER, ignoreAcl: true });
    await caskFs.ensureUser({ user: 'audit-test-user', requestor: TEST_USER, ignoreAcl: true });

    const roleRows = await getAuditRows(caskFs, 'acl.ensure_role');
    const userRows = await getAuditRows(caskFs, 'acl.ensure_user');

    assert.ok(roleRows.some(r => r.details.role === 'audit-test-role'));
    assert.ok(userRows.some(r => r.details.user === 'audit-test-user'));
  });

  it('should correlate a move and its auto-triggered reharvest via cork_trace_id', async () => {
    const OLD_PATH = '/audit-move/doc.jsonld.json';
    const NEW_PATH = '/audit-move/moved/doc.jsonld.json';
    const RESOLVED_NEW = config.schemaPrefix + '/audit-move/moved/doc';

    caskFs.rdf.filterUris = new Set([RESOLVED_NEW]);
    caskFs.rdf.filterUriMatches = [];

    await caskFs.write({
      filePath: OLD_PATH,
      data: Buffer.from(JSON.stringify({
        '@id': 'https://example.org/audit-move',
        'http://schema.org/about': { '@id': 'cask:/' }
      })),
      requestor: TEST_USER,
      ignoreAcl: true
    });

    const traceId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const result = await caskFs.moveFile(
      { filePath: OLD_PATH, requestor: TEST_USER, ignoreAcl: true, corkTraceId: traceId },
      { destPath: NEW_PATH }
    );
    assert.deepStrictEqual(result.reharvest.reharvested, [NEW_PATH]);

    const moveRows = await getAuditRows(caskFs, 'file.move');
    const reharvestRows = await getAuditRows(caskFs, 'file.reharvest');

    const moveRow = moveRows.find(r => r.cork_trace_id === traceId);
    const reharvestRow = reharvestRows.find(r => r.cork_trace_id === traceId);

    assert.ok(moveRow, 'expected a file.move row with the shared corkTraceId');
    assert.ok(reharvestRow, 'expected the auto-triggered file.reharvest row to share the same corkTraceId');
    assert.strictEqual(reharvestRow.resource_path, NEW_PATH);
  });
});

describe('CLI – audit rotate/list/get/delete', () => {
  let caskFs;
  let tmpDir;
  let envFile;
  let archiveDir;

  before(async () => {
    caskFs = await setup();
    archiveDir = path.join(caskFs.rootDir, 'audit');
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cask-audit-cli-'));
    envFile = path.join(tmpDir, 'environments.json');

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
    await teardown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function env() {
    return {
      CASKFS_ENV_FILE: envFile,
      CASKFS_ACL_ENABLED: 'false',
      CASKFS_LOG_LEVEL: 'error',
      CASKFS_AUDIT_ENABLED: 'true',
      CASKFS_AUDIT_HOT_WINDOW_MONTHS: '1',
    };
  }

  function runCask(args, opts={}) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [CASK_BIN, ...args], { env: { ...process.env, ...(opts.env || {}) } });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
  }

  it('reports nothing to rotate when there are no old partitions', async () => {
    const { code, stdout, stderr } = await runCask(['audit', 'rotate', '--dry-run'], { env: env() });
    assert.strictEqual(code, 0, stderr);
    assert.match(stdout, /nothing to rotate/);
  });

  it('archives directory under <rootDir>/audit, matching the CAS <rootDir>/cas convention', async () => {
    assert.strictEqual(archiveDir, path.join(caskFs.rootDir, 'audit'));
  });

  let partitionName;

  it('exports an old partition to gzipped JSONL under <rootDir>/audit and drops it', async () => {
    const now = new Date();
    const oldMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    partitionName = `audit_log_${oldMonth.getFullYear()}_${String(oldMonth.getMonth() + 1).padStart(2, '0')}`;

    await caskFs.dbClient.query(`SELECT ${config.database.schema}.ensure_audit_partition($1::date)`, [oldMonth]);
    await caskFs.dbClient.query(`
      INSERT INTO ${config.database.schema}.audit_log (created, requestor, operation, resource_type, resource_path)
      VALUES ($1, $2, 'file.write', 'file', '/audit-rotate/old.txt')
    `, [new Date(oldMonth.getFullYear(), oldMonth.getMonth(), 15), TEST_USER]);

    const { code, stdout, stderr } = await runCask(['audit', 'rotate'], { env: env() });
    assert.strictEqual(code, 0, stderr);
    assert.match(stdout, new RegExp(partitionName));

    const archivePath = path.join(archiveDir, `${partitionName}.jsonl.gz`);
    const gzipped = await fs.readFile(archivePath);
    const lines = zlib.gunzipSync(gzipped).toString('utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.strictEqual(row.resource_path, '/audit-rotate/old.txt');

    const partitionCheck = await caskFs.dbClient.query(`
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
    `, [config.database.schema, partitionName]);
    assert.strictEqual(partitionCheck.rows.length, 0, 'rotated partition should be dropped');
  });

  it('lists the rotated archive via `cask audit list`', async () => {
    const { code, stdout, stderr } = await runCask(['audit', 'list'], { env: env() });
    assert.strictEqual(code, 0, stderr);
    assert.match(stdout, new RegExp(`${partitionName}\\.jsonl\\.gz`));
  });

  it('downloads the rotated archive via `cask audit get`', async () => {
    const outputPath = path.join(tmpDir, 'downloaded.jsonl.gz');
    const { code, stderr } = await runCask(
      ['audit', 'get', `${partitionName}.jsonl.gz`, '-o', outputPath],
      { env: env() }
    );
    assert.strictEqual(code, 0, stderr);

    const gzipped = await fs.readFile(outputPath);
    const row = JSON.parse(zlib.gunzipSync(gzipped).toString('utf-8').trim());
    assert.strictEqual(row.resource_path, '/audit-rotate/old.txt');
  });

  it('rejects a path-traversal filename', async () => {
    await assert.rejects(
      caskFs.getAuditArchive({ name: '../../etc/passwd' }),
      /Invalid audit archive filename/
    );
  });

  it('deletes the rotated archive via `cask audit delete`', async () => {
    const { code, stderr } = await runCask(['audit', 'delete', `${partitionName}.jsonl.gz`], { env: env() });
    assert.strictEqual(code, 0, stderr);

    await assert.rejects(fs.access(path.join(archiveDir, `${partitionName}.jsonl.gz`)));

    const rows = await getAuditRows(caskFs, 'audit.delete_archive');
    assert.ok(rows.some(r => r.resource_path === `${partitionName}.jsonl.gz`));
  });
});

describe('/audit HTTP API', () => {
  let caskFs, baseUrl;
  let partitionName;

  before(async () => {
    ({ caskFs, baseUrl } = await httpSetup());
    config.audit.enabled = true;
  });

  after(async () => {
    config.audit.enabled = false;
    await httpTeardown();
  });

  it('POST /audit/rotate reports nothing to rotate when there are no old partitions', async () => {
    const res = await fetch(`${baseUrl}/audit/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body.partitions, []);
  });

  it('rotates an old partition, then GET /audit/archives lists it', async () => {
    const now = new Date();
    const oldMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    partitionName = `audit_log_${oldMonth.getFullYear()}_${String(oldMonth.getMonth() + 1).padStart(2, '0')}`;

    await caskFs.dbClient.query(`SELECT ${config.database.schema}.ensure_audit_partition($1::date)`, [oldMonth]);
    await caskFs.dbClient.query(`
      INSERT INTO ${config.database.schema}.audit_log (created, requestor, operation, resource_type, resource_path)
      VALUES ($1, 'http-test-user', 'file.write', 'file', '/http-audit/old.txt')
    `, [new Date(oldMonth.getFullYear(), oldMonth.getMonth(), 15)]);

    const rotateRes = await fetch(`${baseUrl}/audit/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(rotateRes.status, 200);
    const rotateBody = await rotateRes.json();
    assert.ok(rotateBody.rotated.some(r => r.partition === partitionName));

    const listRes = await fetch(`${baseUrl}/audit/archives`);
    assert.strictEqual(listRes.status, 200);
    const { archives } = await listRes.json();
    assert.ok(archives.some(a => a.name === `${partitionName}.jsonl.gz`));
  });

  it('GET /audit/archives/:name downloads the raw gzip bytes', async () => {
    const res = await fetch(`${baseUrl}/audit/archives/${partitionName}.jsonl.gz`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/gzip');
    const buf = Buffer.from(await res.arrayBuffer());
    const row = JSON.parse(zlib.gunzipSync(buf).toString('utf-8').trim());
    assert.strictEqual(row.resource_path, '/http-audit/old.txt');
  });

  it('GET /audit/archives/:name returns 404 for a nonexistent archive', async () => {
    const res = await fetch(`${baseUrl}/audit/archives/audit_log_1999_01.jsonl.gz`);
    assert.strictEqual(res.status, 404);
  });

  it('DELETE /audit/archives/:name deletes the archive', async () => {
    const res = await fetch(`${baseUrl}/audit/archives/${partitionName}.jsonl.gz`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);

    const listRes = await fetch(`${baseUrl}/audit/archives`);
    const { archives } = await listRes.json();
    assert.ok(!archives.some(a => a.name === `${partitionName}.jsonl.gz`));
  });
});

describe('CLI – audit rotate/list/get/delete (http)', () => {
  let caskFs, baseUrl;
  let tmpDir, envFile;
  let partitionName;

  before(async () => {
    ({ caskFs, baseUrl } = await httpSetup());
    config.audit.enabled = true;

    tmpDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'cask-audit-cli-http-'));
    envFile = path.join(tmpDir, 'environments.json');

    const baseUrlObj = new URL(baseUrl);
    const envData = {
      defaultEnvironment: 'http-test',
      environments: {
        'http-test': {
          type: 'http',
          host: `${baseUrlObj.protocol}//${baseUrlObj.host}`,
          path: baseUrlObj.pathname,
        }
      }
    };
    await fs.writeFile(envFile, JSON.stringify(envData, null, 2));
  });

  after(async () => {
    config.audit.enabled = false;
    await httpTeardown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function env() {
    return { CASKFS_ENV_FILE: envFile, CASKFS_LOG_LEVEL: 'error' };
  }

  function runCask(args, opts={}) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [CASK_BIN, ...args], { env: { ...process.env, ...(opts.env || {}) } });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
  }

  it('rotates via the HTTP server and lists the archive via `cask audit list`', async () => {
    const now = new Date();
    const oldMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    partitionName = `audit_log_${oldMonth.getFullYear()}_${String(oldMonth.getMonth() + 1).padStart(2, '0')}`;

    await caskFs.dbClient.query(`SELECT ${config.database.schema}.ensure_audit_partition($1::date)`, [oldMonth]);
    await caskFs.dbClient.query(`
      INSERT INTO ${config.database.schema}.audit_log (created, requestor, operation, resource_type, resource_path)
      VALUES ($1, 'http-cli-user', 'file.write', 'file', '/audit-rotate-http/old.txt')
    `, [new Date(oldMonth.getFullYear(), oldMonth.getMonth(), 15)]);

    const rotateResult = await runCask(['audit', 'rotate'], { env: env() });
    assert.strictEqual(rotateResult.code, 0, rotateResult.stderr);
    assert.match(rotateResult.stdout, new RegExp(partitionName));

    const listResult = await runCask(['audit', 'list'], { env: env() });
    assert.strictEqual(listResult.code, 0, listResult.stderr);
    assert.match(listResult.stdout, new RegExp(`${partitionName}\\.jsonl\\.gz`));
  });

  it('downloads the archive via `cask audit get` and deletes it via `cask audit delete`', async () => {
    const outputPath = path.join(tmpDir, 'downloaded-http.jsonl.gz');
    const getResult = await runCask(
      ['audit', 'get', `${partitionName}.jsonl.gz`, '-o', outputPath],
      { env: env() }
    );
    assert.strictEqual(getResult.code, 0, getResult.stderr);

    const gzipped = await fs.readFile(outputPath);
    const row = JSON.parse(zlib.gunzipSync(gzipped).toString('utf-8').trim());
    assert.strictEqual(row.resource_path, '/audit-rotate-http/old.txt');

    const deleteResult = await runCask(['audit', 'delete', `${partitionName}.jsonl.gz`], { env: env() });
    assert.strictEqual(deleteResult.code, 0, deleteResult.stderr);

    const listResult = await runCask(['audit', 'list'], { env: env() });
    assert.doesNotMatch(listResult.stdout, new RegExp(`${partitionName}\\.jsonl\\.gz`));
  });
});
