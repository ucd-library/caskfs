import assert from 'assert';
import crypto from 'crypto';
import path from 'path';
import { setup, teardown } from './helpers/setup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @function sha256
 * @description Compute a sha256 hex digest of a string or Buffer.
 * @param {String|Buffer} content
 * @returns {String}
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * @function writeFile
 * @description Write content into CaskFS and return the resulting hash and file metadata.
 * @param {Object} caskFs
 * @param {String} filePath
 * @param {String|Buffer} content
 * @returns {Promise<{hash: String, file: Object}>}
 */
async function writeFile(caskFs, filePath, content) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const ctx = await caskFs.write({ filePath, data, requestor: 'test', ignoreAcl: true });
  const file = await caskFs.metadata({ filePath, ignoreAcl: true });
  return { hash: file.hash_value, file };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('optimisticBatchWrite — direct-pg', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('throws when opts.files is not an array', async () => {
      await assert.rejects(
        () => caskFs.optimisticBatchWrite({}, { files: 'bad' }),
        /must be an array/
      );
    });

    it('throws when batch exceeds maxFilesPerBatch', async () => {
      const files = Array.from({ length: 1001 }, (_, i) => ({
        filename: `f${i}.txt`, directory: '/test', hash: 'a'.repeat(64),
      }));
      await assert.rejects(
        () => caskFs.optimisticBatchWrite({}, { files }),
        /max is/
      );
    });

    it('puts per-file validation failures into errors, not doesNotExist', async () => {
      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { directory: '/test', hash: 'a'.repeat(64) },                  // missing filename
        { filename: 'f.txt', hash: 'a'.repeat(64) },                   // missing directory
        { filename: 'f.txt', directory: '/test' },                     // missing hash
      ]});
      assert.strictEqual(result.errors.length, 3);
      assert.strictEqual(result.written.length, 0);
      assert.strictEqual(result.doesNotExist.length, 0);
    });

    it('accepts an empty files array and returns empty result', async () => {
      const result = await caskFs.optimisticBatchWrite({}, { files: [] });
      assert.deepStrictEqual(result, {
        written: [], metadataUpdated: [], noChange: [], doesNotExist: [], errors: [],
      });
    });
  });

  // -------------------------------------------------------------------------
  // doesNotExist — hash not in CAS
  // -------------------------------------------------------------------------

  describe('doesNotExist', () => {
    it('puts file in doesNotExist when hash is not in CAS', async () => {
      const fakeHash = 'a'.repeat(64);
      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'ghost.txt', directory: '/ghost', hash: fakeHash },
      ]});
      assert.strictEqual(result.doesNotExist.length, 1);
      assert.ok(result.doesNotExist[0].includes('ghost.txt'));
      assert.strictEqual(result.written.length, 0);
      assert.strictEqual(result.errors.length, 0);
    });

    it('handles mixed batch: doesNotExist for missing hash, written for valid hash', async () => {
      const { hash } = await writeFile(caskFs, '/mix/existing.txt', 'content-mix');
      const fakeHash = 'b'.repeat(64);

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'missing.txt', directory: '/mix', hash: fakeHash },
        { filename: 'new.txt',     directory: '/mix', hash },
      ]});

      assert.strictEqual(result.doesNotExist.length, 1);
      assert.strictEqual(result.written.length, 1);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // written — new file insert
  // -------------------------------------------------------------------------

  describe('written — insert', () => {
    it('creates a new file record and returns action: insert', async () => {
      const { hash } = await writeFile(caskFs, '/insert/seed.txt', 'seed content');

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'newfile.txt', directory: '/insert', hash },
      ]});

      assert.strictEqual(result.written.length, 1);
      assert.strictEqual(result.written[0].path, '/insert/newfile.txt');
      assert.strictEqual(result.written[0].action, 'insert');
      assert.strictEqual(result.metadataUpdated.length, 0);
      assert.strictEqual(result.noChange.length, 0);
    });

    it('new file record can be read back from the database', async () => {
      const { hash } = await writeFile(caskFs, '/insert/seed2.txt', 'seed2');

      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'readback.txt', directory: '/insert', hash, metadata: { mimeType: 'text/plain' } },
      ]});

      const meta = await caskFs.metadata({ filePath: '/insert/readback.txt', ignoreAcl: true });
      assert.strictEqual(meta.hash_value, hash);
      assert.strictEqual(meta.metadata?.mimeType, 'text/plain');
    });

    it('auto-creates the directory when it does not exist', async () => {
      const { hash } = await writeFile(caskFs, '/insert/seed3.txt', 'seed3');

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'deep.txt', directory: '/brand/new/directory', hash },
      ]});

      assert.strictEqual(result.written.length, 1);
      const meta = await caskFs.metadata({ filePath: '/brand/new/directory/deep.txt', ignoreAcl: true });
      assert.ok(meta.file_id);
    });

    it('stores partition keys on a new file', async () => {
      const { hash } = await writeFile(caskFs, '/insert/seed4.txt', 'seed4');

      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'withkeys.txt', directory: '/insert', hash, partitionKeys: ['pk-a', 'pk-b'] },
      ]});

      const meta = await caskFs.metadata({ filePath: '/insert/withkeys.txt', ignoreAcl: true });
      const keys = meta.partition_keys || [];
      assert.ok(keys.includes('pk-a'));
      assert.ok(keys.includes('pk-b'));
    });

    it('writes multiple new files in one batch', async () => {
      const { hash } = await writeFile(caskFs, '/multi/seed.txt', 'multi-seed');

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'a.txt', directory: '/multi', hash },
        { filename: 'b.txt', directory: '/multi', hash },
        { filename: 'c.txt', directory: '/multi', hash },
      ]});

      assert.strictEqual(result.written.length, 3);
      assert.ok(result.written.every(w => w.action === 'insert'));
    });
  });

  // -------------------------------------------------------------------------
  // written — hash updated
  // -------------------------------------------------------------------------

  describe('written — hashUpdated', () => {
    it('updates hash and returns action: hashUpdated when content changes', async () => {
      const { hash: oldHash } = await writeFile(caskFs, '/update/v1.txt', 'version one content');
      const { hash: newHash } = await writeFile(caskFs, '/update/v2.txt', 'version two content');

      // Point the existing path at the new hash
      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'v1.txt', directory: '/update', hash: newHash },
      ]});

      assert.strictEqual(result.written.length, 1);
      assert.strictEqual(result.written[0].action, 'hashUpdated');

      const meta = await caskFs.metadata({ filePath: '/update/v1.txt', ignoreAcl: true });
      assert.strictEqual(meta.hash_value, newHash);
    });

    it('replaces partition keys when hash changes', async () => {
      const { hash: oldHash } = await writeFile(caskFs, '/update/pk1.txt', 'pk content 1');
      const { hash: newHash } = await writeFile(caskFs, '/update/pk2.txt', 'pk content 2');

      // Set initial keys
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'pkfile.txt', directory: '/update', hash: oldHash, partitionKeys: ['old-key'] },
      ]});

      // Update with new hash and new keys
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'pkfile.txt', directory: '/update', hash: newHash, partitionKeys: ['new-key'] },
      ]});

      const meta = await caskFs.metadata({ filePath: '/update/pkfile.txt', ignoreAcl: true });
      const keys = meta.partition_keys || [];
      assert.ok(keys.includes('new-key'));
      assert.ok(!keys.includes('old-key'));
    });
  });

  // -------------------------------------------------------------------------
  // metadataUpdated — same hash, different metadata or partition keys
  // -------------------------------------------------------------------------

  describe('metadataUpdated', () => {
    it('returns metadataUpdated when metadata changes but hash is the same', async () => {
      const { hash } = await writeFile(caskFs, '/meta/seed.txt', 'meta seed');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'meta.txt', directory: '/meta', hash, metadata: { label: 'v1' } },
      ]});

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'meta.txt', directory: '/meta', hash, metadata: { label: 'v2' } },
      ]});

      assert.strictEqual(result.metadataUpdated.length, 1);
      assert.strictEqual(result.metadataUpdated[0].path, '/meta/meta.txt');
      assert.strictEqual(result.written.length, 0);
      assert.strictEqual(result.noChange.length, 0);

      const after = await caskFs.metadata({ filePath: '/meta/meta.txt', ignoreAcl: true });
      assert.strictEqual(after.metadata?.label, 'v2');
    });

    it('returns metadataUpdated when partition keys change but hash is the same', async () => {
      const { hash } = await writeFile(caskFs, '/meta/pkseed.txt', 'pk seed');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'pkchange.txt', directory: '/meta', hash, partitionKeys: ['alpha'] },
      ]});

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'pkchange.txt', directory: '/meta', hash, partitionKeys: ['beta'] },
      ]});

      assert.strictEqual(result.metadataUpdated.length, 1);

      const after = await caskFs.metadata({ filePath: '/meta/pkchange.txt', ignoreAcl: true });
      const keys = after.partition_keys || [];
      assert.ok(keys.includes('beta'));
      assert.ok(!keys.includes('alpha'));
    });

    it('returns metadataUpdated when both metadata and partition keys change', async () => {
      const { hash } = await writeFile(caskFs, '/meta/both.txt', 'both seed');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'both.txt', directory: '/meta', hash, metadata: { x: 1 }, partitionKeys: ['pk1'] },
      ]});

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'both.txt', directory: '/meta', hash, metadata: { x: 2 }, partitionKeys: ['pk2'] },
      ]});

      assert.strictEqual(result.metadataUpdated.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // noChange — same hash, same metadata, same partition keys
  // -------------------------------------------------------------------------

  describe('noChange', () => {
    it('returns noChange when nothing differs', async () => {
      const { hash } = await writeFile(caskFs, '/nc/seed.txt', 'nc seed');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'nc.txt', directory: '/nc', hash, metadata: { a: 1 }, partitionKeys: ['x'] },
      ]});

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'nc.txt', directory: '/nc', hash, metadata: { a: 1 }, partitionKeys: ['x'] },
      ]});

      assert.strictEqual(result.noChange.length, 1);
      assert.strictEqual(result.noChange[0].path, '/nc/nc.txt');
      assert.strictEqual(result.written.length, 0);
      assert.strictEqual(result.metadataUpdated.length, 0);
    });

    it('does NOT update the modified timestamp on noChange', async () => {
      const { hash } = await writeFile(caskFs, '/nc/ts.txt', 'timestamp test');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'ts.txt', directory: '/nc', hash, metadata: { v: 1 } },
      ]});

      const before = await caskFs.metadata({ filePath: '/nc/ts.txt', ignoreAcl: true });

      // Small delay so a timestamp update would be detectable
      await new Promise(r => setTimeout(r, 50));

      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'ts.txt', directory: '/nc', hash, metadata: { v: 1 } },
      ]});

      const after = await caskFs.metadata({ filePath: '/nc/ts.txt', ignoreAcl: true });
      assert.strictEqual(
        new Date(before.modified).getTime(),
        new Date(after.modified).getTime(),
        'modified timestamp should not change on noChange'
      );
    });

    it('partition key comparison is order-insensitive', async () => {
      const { hash } = await writeFile(caskFs, '/nc/order.txt', 'order test');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'order.txt', directory: '/nc', hash, partitionKeys: ['a', 'b', 'c'] },
      ]});

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'order.txt', directory: '/nc', hash, partitionKeys: ['c', 'a', 'b'] },
      ]});

      assert.strictEqual(result.noChange.length, 1);
    });

    it('existing git-* metadata keys are ignored in the comparison', async () => {
      // Seed: write file directly so git- keys could be present in stored metadata
      const { hash } = await writeFile(caskFs, '/nc/git.txt', 'git meta test');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'git.txt', directory: '/nc', hash, metadata: { mimeType: 'text/plain' } },
      ]});

      // Inject a git- key into stored metadata directly via DB
      await caskFs.dbClient.updateFileMetadata('/nc/git.txt', {
        metadata: { mimeType: 'text/plain', 'git-commit': 'abc123' },
      });

      // Batch write without git- key should be noChange (git- key is stripped in comparison)
      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'git.txt', directory: '/nc', hash, metadata: { mimeType: 'text/plain' } },
      ]});

      assert.strictEqual(result.noChange.length, 1, 'git- keys should be stripped before comparison');
    });

    it('calling batchWrite twice with identical data is idempotent', async () => {
      const { hash } = await writeFile(caskFs, '/nc/idem.txt', 'idempotent');
      const fileDesc = { filename: 'idem.txt', directory: '/nc', hash, metadata: { v: 1 }, partitionKeys: ['k'] };

      const r1 = await caskFs.optimisticBatchWrite({}, { files: [fileDesc] });
      assert.strictEqual(r1.written.length, 0); // already written above by writeFile → insert
      // second call: same data
      const r2 = await caskFs.optimisticBatchWrite({}, { files: [fileDesc] });
      assert.strictEqual(r2.noChange.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed batch
  // -------------------------------------------------------------------------

  describe('mixed batch', () => {
    it('correctly populates all five result buckets in one call', async () => {
      // written (insert): a fresh file path whose CAS hash exists
      const { hash: hashA } = await writeFile(caskFs, '/mixed/seedA.txt', 'content A');
      // written (hashUpdated): existing path with a different hash
      const { hash: hashB1 } = await writeFile(caskFs, '/mixed/seedB1.txt', 'content B1');
      const { hash: hashB2 } = await writeFile(caskFs, '/mixed/seedB2.txt', 'content B2');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'existing-b.txt', directory: '/mixed', hash: hashB1 },
      ]});
      // metadataUpdated: existing path, same hash, different metadata
      const { hash: hashC } = await writeFile(caskFs, '/mixed/seedC.txt', 'content C');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'meta-c.txt', directory: '/mixed', hash: hashC, metadata: { v: 1 } },
      ]});
      // noChange: existing path, same hash, same metadata
      const { hash: hashD } = await writeFile(caskFs, '/mixed/seedD.txt', 'content D');
      await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'nc-d.txt', directory: '/mixed', hash: hashD, metadata: { stable: true } },
      ]});

      const result = await caskFs.optimisticBatchWrite({}, { files: [
        { filename: 'new-a.txt',      directory: '/mixed', hash: hashA },                           // insert
        { filename: 'existing-b.txt', directory: '/mixed', hash: hashB2 },                          // hashUpdated
        { filename: 'meta-c.txt',     directory: '/mixed', hash: hashC, metadata: { v: 2 } },       // metadataUpdated
        { filename: 'nc-d.txt',       directory: '/mixed', hash: hashD, metadata: { stable: true }}, // noChange
        { filename: 'ghost.txt',      directory: '/mixed', hash: 'f'.repeat(64) },                  // doesNotExist
      ]});

      assert.strictEqual(result.written.length, 2, 'insert + hashUpdated');
      assert.ok(result.written.some(w => w.action === 'insert'));
      assert.ok(result.written.some(w => w.action === 'hashUpdated'));
      assert.strictEqual(result.metadataUpdated.length, 1);
      assert.strictEqual(result.noChange.length, 1);
      assert.strictEqual(result.doesNotExist.length, 1);
      assert.strictEqual(result.errors.length, 0);
    });
  });
});
