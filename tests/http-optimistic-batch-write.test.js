import assert from 'assert';
import { setup, teardown } from './helpers/http-setup.js';
import HttpCaskFsClient from '../src/lib/http-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @function writeFile
 * @description Write content into CaskFS via the direct client and return the hash.
 * @param {Object} caskFs
 * @param {String} filePath
 * @param {String|Buffer} content
 * @returns {Promise<String>} hash value
 */
async function writeFile(caskFs, filePath, content) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await caskFs.write({ filePath, data, requestor: 'test', ignoreAcl: true });
  const meta = await caskFs.metadata({ filePath, ignoreAcl: true });
  return meta.hash_value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('optimisticBatchWrite — HTTP', () => {
  let caskFs, baseUrl, client;

  before(async () => {
    ({ caskFs, baseUrl } = await setup());
    client = new HttpCaskFsClient({ host: baseUrl.replace('/api', ''), path: '/api' });
  });

  after(async () => {
    await teardown();
  });

  // -------------------------------------------------------------------------
  // HTTP endpoint contract
  // -------------------------------------------------------------------------

  describe('POST /fs/batch — protocol', () => {
    it('returns 400 when body is missing the files array', async () => {
      const res = await fetch(`${baseUrl}/fs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notFiles: [] }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('returns 400 when body is not valid JSON', async () => {
      const res = await fetch(`${baseUrl}/fs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      assert.strictEqual(res.status, 400);
    });

    it('returns 400 when files is not an array', async () => {
      const res = await fetch(`${baseUrl}/fs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: 'oops' }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('returns 200 with an empty files array', async () => {
      const res = await fetch(`${baseUrl}/fs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [] }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.deepStrictEqual(body, {
        written: [], metadataUpdated: [], noChange: [], doesNotExist: [], errors: [],
      });
    });

    it('response always includes all five result keys', async () => {
      const hash = await writeFile(caskFs, '/http-batch/shape.txt', 'shape test');

      const res = await fetch(`${baseUrl}/fs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [
          { filename: 'new.txt', directory: '/http-batch', hash },
        ]}),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok('written'         in body, 'missing written');
      assert.ok('metadataUpdated' in body, 'missing metadataUpdated');
      assert.ok('noChange'        in body, 'missing noChange');
      assert.ok('doesNotExist'    in body, 'missing doesNotExist');
      assert.ok('errors'          in body, 'missing errors');
    });
  });

  // -------------------------------------------------------------------------
  // HttpCaskFsClient.optimisticBatchWrite
  // -------------------------------------------------------------------------

  describe('HttpCaskFsClient.optimisticBatchWrite', () => {
    it('inserts a new file record and returns written with action: insert', async () => {
      const hash = await writeFile(caskFs, '/client/seed.txt', 'client seed');

      const result = await client.optimisticBatchWrite([
        { filename: 'inserted.txt', directory: '/client', hash },
      ]);

      assert.strictEqual(result.written.length, 1);
      assert.strictEqual(result.written[0].action, 'insert');
      assert.strictEqual(result.written[0].path, '/client/inserted.txt');
    });

    it('returns noChange when called again with the same data', async () => {
      const hash = await writeFile(caskFs, '/client/nc-seed.txt', 'nc seed');
      const fileDesc = { filename: 'nc.txt', directory: '/client', hash, metadata: { x: 1 }, partitionKeys: ['p'] };

      await client.optimisticBatchWrite([fileDesc]);
      const result = await client.optimisticBatchWrite([fileDesc]);

      assert.strictEqual(result.noChange.length, 1);
      assert.strictEqual(result.written.length, 0);
    });

    it('returns doesNotExist (not error) for a missing CAS hash', async () => {
      const fakeHash = 'c'.repeat(64);
      const result = await client.optimisticBatchWrite([
        { filename: 'ghost.txt', directory: '/client', hash: fakeHash },
      ]);

      assert.strictEqual(result.doesNotExist.length, 1);
      assert.strictEqual(result.errors.length, 0);
    });

    it('returns metadataUpdated when metadata changes', async () => {
      const hash = await writeFile(caskFs, '/client/meta-seed.txt', 'meta seed');
      await client.optimisticBatchWrite([
        { filename: 'meta.txt', directory: '/client', hash, metadata: { v: 1 } },
      ]);

      const result = await client.optimisticBatchWrite([
        { filename: 'meta.txt', directory: '/client', hash, metadata: { v: 2 } },
      ]);

      assert.strictEqual(result.metadataUpdated.length, 1);
    });

    it('returns written with action: hashUpdated when content changes', async () => {
      const hash1 = await writeFile(caskFs, '/client/v1.txt', 'version one');
      const hash2 = await writeFile(caskFs, '/client/v2.txt', 'version two');

      await client.optimisticBatchWrite([
        { filename: 'versioned.txt', directory: '/client', hash: hash1 },
      ]);

      const result = await client.optimisticBatchWrite([
        { filename: 'versioned.txt', directory: '/client', hash: hash2 },
      ]);

      assert.strictEqual(result.written.length, 1);
      assert.strictEqual(result.written[0].action, 'hashUpdated');
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end scenarios
  // -------------------------------------------------------------------------

  describe('end-to-end scenarios', () => {
    it('cp simulation: same hash, new path — inserts without re-uploading', async () => {
      // Write content at one path; copy its record to a new path via batch
      const srcHash = await writeFile(caskFs, '/e2e/original.txt', 'shared content');

      const result = await client.optimisticBatchWrite([
        { filename: 'copy.txt', directory: '/e2e', hash: srcHash },
      ]);

      assert.strictEqual(result.written.length, 1);
      assert.strictEqual(result.written[0].action, 'insert');

      // Verify copy path is readable via HTTP
      const readRes = await fetch(`${baseUrl}/fs/e2e/copy.txt`);
      assert.strictEqual(readRes.status, 200);
      const body = await readRes.text();
      assert.strictEqual(body, 'shared content');
    });

    it('large batch: all items processed, partial doesNotExist does not abort', async () => {
      const hash = await writeFile(caskFs, '/e2e/batch-seed.txt', 'batch seed');
      const fakeHash = 'd'.repeat(64);

      const files = [
        ...Array.from({ length: 5 }, (_, i) => ({ filename: `b${i}.txt`, directory: '/e2e/batch', hash })),
        { filename: 'ghost.txt', directory: '/e2e/batch', hash: fakeHash },
      ];

      const result = await client.optimisticBatchWrite(files);

      assert.strictEqual(result.written.length, 5);
      assert.strictEqual(result.doesNotExist.length, 1);
      assert.strictEqual(result.errors.length, 0);
    });
  });
});
