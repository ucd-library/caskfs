import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import tarStream from 'tar-stream';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { setup, teardown } from './helpers/setup.js';
import aclImpl from '../src/lib/acl.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * List all entry names inside a .tar.gz archive.
 *
 * @param {String} archivePath
 * @returns {Promise<String[]>}
 */
async function listArchiveEntries(archivePath) {
  const entries = [];
  const extract = tarStream.extract();
  extract.on('entry', (header, stream, next) => {
    entries.push(header.name);
    stream.resume();
    stream.on('end', next);
  });
  await pipeline(createReadStream(archivePath), zlib.createGunzip(), extract);
  return entries;
}

/**
 * Read a single named entry from a .tar.gz and return its contents as a Buffer.
 *
 * @param {String} archivePath
 * @param {String} entryName
 * @returns {Promise<Buffer|null>}
 */
async function readArchiveEntry(archivePath, entryName) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const extract = tarStream.extract();
    extract.on('entry', (header, stream, next) => {
      if (header.name === entryName) {
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => {
          resolve(Buffer.concat(chunks));
          next();
        });
      } else {
        stream.resume();
        stream.on('end', next);
      }
    });
    extract.on('finish', () => resolve(null));
    extract.on('error', reject);

    pipeline(createReadStream(archivePath), zlib.createGunzip(), extract).catch(reject);
  });
}

// ── export tests ─────────────────────────────────────────────────────────────

describe('Transfer – export()', () => {
  let caskFs;
  let archivePath;

  before(async () => {
    caskFs = await setup();

    // Seed two unique files and one duplicate (same content → same hash).
    await caskFs.write({ filePath: '/a/file1.txt', data: Buffer.from('hello'), requestor: 'test', ignoreAcl: true });
    await caskFs.write({ filePath: '/a/file2.txt', data: Buffer.from('world'), requestor: 'test', ignoreAcl: true });
    // Same content as file1 → same hash, second file record.
    await caskFs.write({ filePath: '/b/file3.txt', data: Buffer.from('hello'), requestor: 'test', ignoreAcl: true });

    archivePath = path.join(os.tmpdir(), `caskfs-export-${Date.now()}.tar.gz`);
    await caskFs.export(archivePath, { rootDir: '/' });
  });

  after(async () => {
    await teardown();
    await fs.rm(archivePath, { force: true });
  });

  it('creates a .tar.gz file', async () => {
    const stat = await fs.stat(archivePath);
    assert.ok(stat.size > 0, 'archive should not be empty');
  });

  it('contains raw CAS files and their .json metadata', async () => {
    const entries = await listArchiveEntries(archivePath);
    const rawEntries  = entries.filter(e => e.startsWith('cas/') && !e.endsWith('.json'));
    const jsonEntries = entries.filter(e => e.startsWith('cas/') && e.endsWith('.json'));

    // 2 unique hashes (file1/file3 share one, file2 is the other)
    assert.strictEqual(rawEntries.length, 2, 'should have 2 raw CAS files');
    assert.strictEqual(jsonEntries.length, 2, 'should have 2 CAS .json metadata files');
  });

  it('the .json metadata records both file paths for the shared hash', async () => {
    const entries = await listArchiveEntries(archivePath);
    const jsonEntries = entries.filter(e => e.startsWith('cas/') && e.endsWith('.json'));

    let sharedMeta = null;
    for (const name of jsonEntries) {
      const buf = await readArchiveEntry(archivePath, name);
      const meta = JSON.parse(buf.toString());
      if (meta.files.length === 2) {
        sharedMeta = meta;
        break;
      }
    }
    assert.ok(sharedMeta, 'one .json should reference two files');
    const paths = sharedMeta.files.map(f => path.join(f.directory, f.filename));
    assert.ok(paths.includes('/a/file1.txt'), 'should reference /a/file1.txt');
    assert.ok(paths.includes('/b/file3.txt'), 'should reference /b/file3.txt');
  });

  it('reports correct summary counts', async () => {
    // Re-run export to capture the return value.
    const archivePath2 = path.join(os.tmpdir(), `caskfs-export-sum-${Date.now()}.tar.gz`);
    try {
      const summary = await caskFs.export(archivePath2, { rootDir: '/' });
      assert.strictEqual(summary.hashCount, 2);
      assert.strictEqual(summary.fileCount, 3); // file1, file2, file3
    } finally {
      await fs.rm(archivePath2, { force: true });
    }
  });

  it('invokes the progress callback for each hash', async () => {
    const called = [];
    const archivePath3 = path.join(os.tmpdir(), `caskfs-export-cb-${Date.now()}.tar.gz`);
    try {
      await caskFs.export(archivePath3, { rootDir: '/', cb: info => called.push(info) });
      const casCallbacks = called.filter(c => c.type === 'cas');
      assert.strictEqual(casCallbacks.length, 2, 'callback should fire once per hash');
      assert.ok(casCallbacks.every(c => c.total === 2));
    } finally {
      await fs.rm(archivePath3, { force: true });
    }
  });

  it('includes ACL data when includeAcl is true', async () => {
    // Add a role so there is something to export.
    await aclImpl.ensureRole({ role: 'export-test-role', dbClient: caskFs.dbClient });

    const aclArchive = path.join(os.tmpdir(), `caskfs-export-acl-${Date.now()}.tar.gz`);
    try {
      await caskFs.export(aclArchive, { rootDir: '/', includeAcl: true });
      const entries = await listArchiveEntries(aclArchive);
      assert.ok(entries.includes('acl/roles.json'), 'acl/roles.json missing');
      assert.ok(entries.includes('acl/users.json'), 'acl/users.json missing');
      assert.ok(entries.includes('acl/user-roles.json'), 'acl/user-roles.json missing');
      assert.ok(entries.includes('acl/permissions.json'), 'acl/permissions.json missing');

      const buf = await readArchiveEntry(aclArchive, 'acl/roles.json');
      const roles = JSON.parse(buf.toString());
      assert.ok(roles.some(r => r.name === 'export-test-role'), 'exported role should appear');
    } finally {
      await fs.rm(aclArchive, { force: true });
    }
  });

  it('includes auto-partition rules when includeAutoPartition is true', async () => {
    await caskFs.autoPath.partition.set({ name: 'export-rule', index: 1 });

    const apArchive = path.join(os.tmpdir(), `caskfs-export-ap-${Date.now()}.tar.gz`);
    try {
      await caskFs.export(apArchive, { rootDir: '/', includeAutoPartition: true });
      const entries = await listArchiveEntries(apArchive);
      assert.ok(entries.includes('auto-partition/partitions.json'));
      assert.ok(entries.includes('auto-partition/buckets.json'));

      const buf = await readArchiveEntry(apArchive, 'auto-partition/partitions.json');
      const rules = JSON.parse(buf.toString());
      assert.ok(rules.some(r => r.name === 'export-rule'));
    } finally {
      await fs.rm(apArchive, { force: true });
    }
  });
});

// ── import tests ─────────────────────────────────────────────────────────────

describe('Transfer – import()', () => {
  let caskFs;
  let archivePath;

  // Export once, then each sub-describe resets the DB before importing.
  before(async () => {
    caskFs = await setup();

    await caskFs.write({ filePath: '/dir1/alpha.txt',  data: Buffer.from('alpha'),  requestor: 'test', ignoreAcl: true });
    await caskFs.write({ filePath: '/dir1/beta.txt',   data: Buffer.from('beta'),   requestor: 'test', ignoreAcl: true });
    // Same content as alpha → same hash.
    await caskFs.write({ filePath: '/dir2/alpha2.txt', data: Buffer.from('alpha'),  requestor: 'test', ignoreAcl: true });

    archivePath = path.join(os.tmpdir(), `caskfs-import-src-${Date.now()}.tar.gz`);
    await caskFs.export(archivePath, { rootDir: '/' });
  });

  after(async () => {
    await teardown();
    await fs.rm(archivePath, { force: true });
  });

  // Helper: clear DB records AND the CAS directory, then import from archive.
  async function resetAndImport(importOpts={}) {
    await caskFs.dbClient.powerWash();
    await caskFs.dbClient.init();
    await fs.rm(path.join(caskFs.rootDir, 'cas'), { recursive: true, force: true });
    return caskFs.import(archivePath, importOpts);
  }

  describe('basic round-trip', () => {
    before(async () => {
      await resetAndImport();
    });

    it('restores all file records', async () => {
      assert.ok(await caskFs.exists({ filePath: '/dir1/alpha.txt',  file: true, ignoreAcl: true }));
      assert.ok(await caskFs.exists({ filePath: '/dir1/beta.txt',   file: true, ignoreAcl: true }));
      assert.ok(await caskFs.exists({ filePath: '/dir2/alpha2.txt', file: true, ignoreAcl: true }));
    });

    it('restores readable file contents', async () => {
      const buf = await caskFs.read({ filePath: '/dir1/alpha.txt', ignoreAcl: true });
      assert.strictEqual(buf.toString(), 'alpha');
    });

    it('returns correct import summary', async () => {
      // Re-run a fresh import to get the summary.
      await caskFs.dbClient.powerWash();
      await caskFs.dbClient.init();
      await fs.rm(path.join(caskFs.rootDir, 'cas'), { recursive: true, force: true });
      const summary = await caskFs.import(archivePath);
      assert.strictEqual(summary.hashCount, 2, '2 unique hashes');
      assert.strictEqual(summary.fileCount, 3, '3 file records');
      assert.strictEqual(summary.skippedFiles, 0);
    });
  });

  describe('duplicate hash deduplication', () => {
    before(async () => {
      await resetAndImport();
    });

    it('both files sharing a hash are accessible after import', async () => {
      const a = await caskFs.read({ filePath: '/dir1/alpha.txt',  ignoreAcl: true });
      const b = await caskFs.read({ filePath: '/dir2/alpha2.txt', ignoreAcl: true });
      assert.strictEqual(a.toString(), 'alpha');
      assert.strictEqual(b.toString(), 'alpha');
    });

    it('the shared hash appears only once in the hash table', async () => {
      const res = await caskFs.dbClient.query(
        `SELECT COUNT(*) AS cnt FROM ${caskFs.schema}.hash WHERE value = (
          SELECT hash_value FROM ${caskFs.schema}.file_view WHERE filepath = '/dir1/alpha.txt'
        )`
      );
      assert.strictEqual(parseInt(res.rows[0].cnt), 1);
    });
  });

  describe('overwrite behaviour', () => {
    it('throws DuplicateFileError when overwrite is false (default)', async () => {
      await resetAndImport(); // first import — works fine
      // Second import without overwrite — all paths already exist.
      await assert.rejects(
        () => caskFs.import(archivePath),
        { name: 'DuplicateFileError' }
      );
    });

    it('succeeds with overwrite:true on duplicate paths', async () => {
      await resetAndImport(); // first import
      // Second import with overwrite should not throw.
      await assert.doesNotReject(() => caskFs.import(archivePath, { overwrite: true }));
    });

    it('file content is correct after overwrite import', async () => {
      await resetAndImport();
      await caskFs.import(archivePath, { overwrite: true });
      const buf = await caskFs.read({ filePath: '/dir1/beta.txt', ignoreAcl: true });
      assert.strictEqual(buf.toString(), 'beta');
    });
  });
});

// ── ACL round-trip ────────────────────────────────────────────────────────────

describe('Transfer – ACL export/import', () => {
  let caskFs;
  let archivePath;

  before(async () => {
    caskFs = await setup();
    aclImpl.enabled = true;

    // Write a file so the directory exists for the ACL permission.
    await caskFs.write({ filePath: '/protected/secret.txt', data: Buffer.from('secret'), requestor: 'test', ignoreAcl: true });

    await aclImpl.ensureUserRole({ user: 'alice', role: 'reader', dbClient: caskFs.dbClient });
    await aclImpl.setDirectoryPermission({
      directory: '/protected',
      role: 'reader',
      permission: 'read',
      dbClient: caskFs.dbClient
    });

    archivePath = path.join(os.tmpdir(), `caskfs-acl-${Date.now()}.tar.gz`);
    await caskFs.export(archivePath, { rootDir: '/', includeAcl: true });
  });

  after(async () => {
    aclImpl.enabled = false;
    await teardown();
    await fs.rm(archivePath, { force: true });
  });

  describe('conflict = fail (default)', () => {
    it('throws when importing ACL onto a system that already has the same role', async () => {
      // DB still has the role from before().
      await assert.rejects(
        () => caskFs.import(archivePath, { overwrite: true }),
        /ACL role already exists/
      );
    });
  });

  describe('conflict = skip', () => {
    before(async () => {
      // Fresh DB so CAS files stay but records are gone.
      await caskFs.dbClient.powerWash();
      await caskFs.dbClient.init();
      await caskFs.import(archivePath, { aclConflict: 'skip' });
    });

    it('roles are present after import', async () => {
      const res = await caskFs.dbClient.query(
        `SELECT name FROM ${caskFs.schema}.acl_role WHERE name = 'reader'`
      );
      assert.strictEqual(res.rows.length, 1);
    });

    it('user-role mapping is restored', async () => {
      const res = await caskFs.dbClient.query(
        `SELECT * FROM ${caskFs.schema}.acl_user_roles_view WHERE "user" = 'alice' AND role = 'reader'`
      );
      assert.strictEqual(res.rows.length, 1);
    });

    it('directory permission is restored', async () => {
      const hasAccess = await aclImpl.hasPermission({
        requestor: 'alice',
        filePath: '/protected',
        permission: 'read',
        dbClient: caskFs.dbClient
      });
      assert.strictEqual(hasAccess, true);
    });

    it('does NOT throw when importing again (skip on conflict)', async () => {
      await assert.doesNotReject(
        () => caskFs.import(archivePath, { overwrite: true, aclConflict: 'skip' })
      );
    });
  });

  describe('conflict = merge', () => {
    let mergeArchivePath;

    before(async () => {
      // Fresh DB — pre-seed only 'read' permission, then build an archive that
      // carries 'write'.  Merging should add 'write' on top of the existing 'read'.
      // This way the final hasPermission('write') check is only satisfied by the merge,
      // not by any implied permission (write implies read in CaskFS, not the reverse).
      await caskFs.dbClient.powerWash();
      await caskFs.dbClient.init();

      await caskFs.write({ filePath: '/protected/secret.txt', data: Buffer.from('secret'), requestor: 'test', ignoreAcl: true });
      await aclImpl.ensureUserRole({ user: 'alice', role: 'reader', dbClient: caskFs.dbClient });
      await aclImpl.setDirectoryPermission({
        directory: '/protected',
        role: 'reader',
        permission: 'write',
        dbClient: caskFs.dbClient
      });

      // Export a merge-specific archive that carries 'write' permission.
      mergeArchivePath = path.join(os.tmpdir(), `caskfs-acl-merge-${Date.now()}.tar.gz`);
      await caskFs.export(mergeArchivePath, { rootDir: '/', includeAcl: true });

      // Now reset to only 'read' so the merge has a real permission to add.
      await caskFs.dbClient.powerWash();
      await caskFs.dbClient.init();
      await caskFs.write({ filePath: '/protected/secret.txt', data: Buffer.from('secret'), requestor: 'test', ignoreAcl: true });
      await aclImpl.ensureUserRole({ user: 'alice', role: 'reader', dbClient: caskFs.dbClient });
      await aclImpl.setDirectoryPermission({
        directory: '/protected',
        role: 'reader',
        permission: 'read',
        dbClient: caskFs.dbClient
      });
    });

    after(async () => {
      await fs.rm(mergeArchivePath, { force: true });
    });

    it('does not throw when existing ACL and aclConflict is merge', async () => {
      await assert.doesNotReject(
        () => caskFs.import(mergeArchivePath, { overwrite: true, aclConflict: 'merge' })
      );
    });

    it('pre-existing read permission is preserved after merge', async () => {
      const res = await caskFs.dbClient.query(`
        SELECT p.permission
        FROM ${caskFs.schema}.acl_permission p
        JOIN ${caskFs.schema}.root_directory_acl rda ON p.root_directory_acl_id = rda.root_directory_acl_id
        JOIN ${caskFs.schema}.directory d ON rda.directory_id = d.directory_id
        JOIN ${caskFs.schema}.acl_role r ON p.role_id = r.role_id
        WHERE d.fullname = '/protected' AND r.name = 'reader'
      `);
      const perms = res.rows.map(r => r.permission);
      assert.ok(perms.includes('read'), 'pre-existing read permission should be preserved');
    });

    it('write permission from archive is merged in', async () => {
      const res = await caskFs.dbClient.query(`
        SELECT p.permission
        FROM ${caskFs.schema}.acl_permission p
        JOIN ${caskFs.schema}.root_directory_acl rda ON p.root_directory_acl_id = rda.root_directory_acl_id
        JOIN ${caskFs.schema}.directory d ON rda.directory_id = d.directory_id
        JOIN ${caskFs.schema}.acl_role r ON p.role_id = r.role_id
        WHERE d.fullname = '/protected' AND r.name = 'reader'
      `);
      const perms = res.rows.map(r => r.permission);
      assert.ok(perms.includes('write'), 'write permission from archive should be merged in');
    });

    it('user has write access after merge', async () => {
      const hasAccess = await aclImpl.hasPermission({
        requestor: 'alice',
        filePath: '/protected',
        permission: 'write',
        dbClient: caskFs.dbClient
      });
      assert.strictEqual(hasAccess, true);
    });
  });
});

// ── auto-partition round-trip ─────────────────────────────────────────────────

describe('Transfer – auto-partition export/import', () => {
  let caskFs;
  let archivePath;

  before(async () => {
    caskFs = await setup();
    await caskFs.autoPath.partition.set({ name: 'year', index: 1, filterRegex: '^\\d{4}$' });
    await caskFs.autoPath.bucket.set({ name: 'dept', index: 2 });

    archivePath = path.join(os.tmpdir(), `caskfs-ap-${Date.now()}.tar.gz`);
    await caskFs.export(archivePath, { rootDir: '/', includeAutoPartition: true });
  });

  after(async () => {
    await teardown();
    await fs.rm(archivePath, { force: true });
  });

  it('throws on duplicate rule when autoPartitionConflict = fail', async () => {
    // Rules already exist from before().
    await assert.rejects(
      () => caskFs.import(archivePath, { autoPartitionConflict: 'fail' }),
      /Partition rule already exists/
    );
  });

  it('restores partition rules after a DB reset with conflict = skip', async () => {
    await caskFs.dbClient.powerWash();
    await caskFs.dbClient.init();

    await caskFs.import(archivePath, { autoPartitionConflict: 'skip' });

    const rules = await caskFs.autoPath.partition.getConfig(true);
    assert.ok(rules.some(r => r.name === 'year'), 'year rule should be restored');
  });

  it('restores bucket rules', async () => {
    const buckets = await caskFs.autoPath.bucket.getConfig(true);
    assert.ok(buckets.some(r => r.name === 'dept'), 'dept bucket rule should be restored');
  });

  it('does not throw on duplicate when autoPartitionConflict = merge', async () => {
    // Rules now exist from the previous test — merge should upsert silently.
    await assert.doesNotReject(
      () => caskFs.import(archivePath, { autoPartitionConflict: 'merge' })
    );
  });
});
