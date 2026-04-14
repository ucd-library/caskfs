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
