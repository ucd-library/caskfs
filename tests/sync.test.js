import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const FAKE_HASH = 'a'.repeat(64); // valid hex length, will never exist in CAS

describe('CaskFS.sync()', () => {
  let caskFs;
  let knownHash;

  before(async () => {
    caskFs = await setup();

    // Seed a real file so we have a known hash backed by actual CAS content.
    await caskFs.write({
      filePath: '/sync-seed/original.txt',
      data: Buffer.from('sync-test-content'),
      requestor: 'test',
      ignoreAcl: true,
    });

    const res = await caskFs.dbClient.query(`
      SELECT hash_value FROM ${caskFs.schema}.file_view WHERE filepath = '/sync-seed/original.txt'
    `);
    knownHash = res.rows[0].hash_value;
  });

  after(async () => {
    await teardown();
  });

  // ── fileInserts ─────────────────────────────────────────────────────────────

  describe('fileInserts', () => {
    it('reports fileInserts for a new path pointing at an existing hash', async () => {
      const result = await caskFs.sync({ requestor: 'test' }, {
        files: [{ filePath: '/sync-test/new-alias.txt', hash: knownHash }],
      });

      assert.ok(result.fileInserts.includes('/sync-test/new-alias.txt'), 'path should be in fileInserts');
      assert.strictEqual(result.doesNotExist.length, 0);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  // ── noChanges ───────────────────────────────────────────────────────────────

  describe('noChanges', () => {
    it('reports noChanges when syncing the same path with the same hash again', async () => {
      // /sync-test/new-alias.txt was inserted in the previous describe block.
      const result = await caskFs.sync({ requestor: 'test' }, {
        files: [{ filePath: '/sync-test/new-alias.txt', hash: knownHash }],
      });

      assert.ok(result.noChanges.includes('/sync-test/new-alias.txt'), 'path should be in noChanges');
      assert.strictEqual(result.fileInserts.length, 0);
      assert.strictEqual(result.doesNotExist.length, 0);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  // ── doesNotExist ────────────────────────────────────────────────────────────

  describe('doesNotExist', () => {
    it('reports doesNotExist for a hash that is not in CAS', async () => {
      const result = await caskFs.sync({ requestor: 'test' }, {
        files: [{ filePath: '/sync-test/ghost.txt', hash: FAKE_HASH }],
      });

      assert.ok(result.doesNotExist.includes('/sync-test/ghost.txt'), 'path should be in doesNotExist');
      assert.strictEqual(result.fileInserts.length, 0);
      assert.strictEqual(result.errors.length, 0);
    });

    it('does not create a file record for a missing hash', async () => {
      const res = await caskFs.dbClient.query(`
        SELECT 1 FROM ${caskFs.schema}.file_view WHERE filepath = '/sync-test/ghost.txt'
      `);
      assert.strictEqual(res.rows.length, 0, 'no file record should be created for a missing hash');
    });
  });

  // ── errors ──────────────────────────────────────────────────────────────────

  describe('errors', () => {
    it('reports errors for entries missing a hash', async () => {
      const result = await caskFs.sync({ requestor: 'test' }, {
        files: [{ filePath: '/sync-test/no-hash.txt' }],
      });

      assert.strictEqual(result.errors.length, 1, 'should report one error');
      assert.ok(result.fileInserts.length === 0);
      assert.ok(result.doesNotExist.length === 0);
    });

    it('reports errors for entries missing a filePath', async () => {
      const result = await caskFs.sync({ requestor: 'test' }, {
        files: [{ hash: knownHash }],
      });

      assert.strictEqual(result.errors.length, 1, 'should report one error');
    });
  });

  // ── mixed batch ─────────────────────────────────────────────────────────────

  describe('mixed batch', () => {
    it('correctly distributes files across all result buckets in one call', async () => {
      const result = await caskFs.sync({ requestor: 'test' }, {
        files: [
          // Should be noChanges — this path was inserted in the fileInserts test above
          { filePath: '/sync-test/new-alias.txt', hash: knownHash },
          // Should be fileInserts — brand new path, known hash
          { filePath: '/sync-test/another-alias.txt', hash: knownHash },
          // Should be doesNotExist — fake hash
          { filePath: '/sync-test/missing.txt', hash: FAKE_HASH },
          // Should be errors — no hash provided
          { filePath: '/sync-test/bad-entry.txt' },
        ],
      });

      assert.ok(result.noChanges.includes('/sync-test/new-alias.txt'), 'existing path should be noChanges');
      assert.ok(result.fileInserts.includes('/sync-test/another-alias.txt'), 'new path should be fileInserts');
      assert.ok(result.doesNotExist.includes('/sync-test/missing.txt'), 'fake hash should be doesNotExist');
      assert.strictEqual(result.errors.length, 1, 'bad entry should produce one error');
    });
  });

  // ── metadataUpdates ─────────────────────────────────────────────────────────

  describe('metadataUpdates', () => {
    before(async () => {
      // Seed a file with initial metadata
      await caskFs.write({
        filePath: '/sync-meta/doc.txt',
        data: Buffer.from('metadata-test'),
        requestor: 'test',
        ignoreAcl: true,
        metadata: { color: 'red' },
      });
    });

    it('reports metadataUpdates when metadata changes for an existing path', async () => {
      const res = await caskFs.dbClient.query(`
        SELECT hash_value FROM ${caskFs.schema}.file_view WHERE filepath = '/sync-meta/doc.txt'
      `);
      const hash = res.rows[0].hash_value;

      const result = await caskFs.sync({ requestor: 'test' }, {
        replace: true,
        files: [{ filePath: '/sync-meta/doc.txt', hash, metadata: { color: 'blue' } }],
      });

      assert.ok(
        result.metadataUpdates.includes('/sync-meta/doc.txt'),
        'path should be in metadataUpdates'
      );
      assert.strictEqual(result.fileInserts.length, 0);
      assert.strictEqual(result.doesNotExist.length, 0);
      assert.strictEqual(result.errors.length, 0);
    });
  });
});
