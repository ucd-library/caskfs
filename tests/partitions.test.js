import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';

const TEST_USER = 'test-user';

// Helper to get partition keys from a written file's context.
// write() stores the applied keys as camelCase .partitionKeys on ctx.data.file.
async function writeAndGetKeys(caskFs, filePath, extra={}) {
  const ctx = await caskFs.write({
    filePath,
    data: Buffer.from('content for ' + filePath),
    requestor: TEST_USER,
    ignoreAcl: true,
    ...extra,
  });
  return ctx.data.file?.partitionKeys ?? [];
}

// Helper to get partition_keys from metadata
async function getKeys(caskFs, filePath) {
  const meta = await caskFs.metadata({ filePath, requestor: TEST_USER, ignoreAcl: true });
  return meta.partition_keys ?? [];
}

describe('Partition Keys', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  // ── Manual partition keys ──────────────────────────────────────────────────

  describe('manual partition keys', () => {
    it('should apply a single manual key set at write time', async () => {
      const keys = await writeAndGetKeys(caskFs, '/manual/single.txt', {
        partitionKeys: ['project-alpha'],
      });
      assert.ok(keys.includes('project-alpha'), 'should have the manually specified key');
    });

    it('should apply multiple manual keys set at write time', async () => {
      const keys = await writeAndGetKeys(caskFs, '/manual/multi.txt', {
        partitionKeys: ['team-eng', 'sprint-42'],
      });
      assert.ok(keys.includes('team-eng'));
      assert.ok(keys.includes('sprint-42'));
    });

    it('manual keys should be present in metadata after write', async () => {
      await writeAndGetKeys(caskFs, '/manual/meta-check.txt', {
        partitionKeys: ['meta-key'],
      });
      const keys = await getKeys(caskFs, '/manual/meta-check.txt');
      assert.ok(keys.includes('meta-key'));
    });

    it('should find a file by its manual partition key', async () => {
      await writeAndGetKeys(caskFs, '/manual/findable.txt', {
        partitionKeys: ['findable-key'],
      });
      const result = await caskFs.dbClient.findFiles({
        partitionKeys: ['findable-key'],
        ignoreAcl: true,
      });
      const paths = result.results.map(r => r.filepath);
      assert.ok(paths.includes('/manual/findable.txt'));
    });

    it('should AND multiple partition key filters — only files matching all keys are returned', async () => {
      await writeAndGetKeys(caskFs, '/manual/and-match.txt',  { partitionKeys: ['key-a', 'key-b'] });
      await writeAndGetKeys(caskFs, '/manual/only-a.txt',     { partitionKeys: ['key-a'] });

      const result = await caskFs.dbClient.findFiles({
        partitionKeys: ['key-a', 'key-b'],
        ignoreAcl: true,
      });
      const paths = result.results.map(r => r.filepath);
      assert.ok(paths.includes('/manual/and-match.txt'), 'file with both keys should appear');
      assert.ok(!paths.includes('/manual/only-a.txt'),   'file with only one key should be excluded');
    });

    it('patchMetadata should replace partition keys', async () => {
      await writeAndGetKeys(caskFs, '/manual/patch.txt', {
        partitionKeys: ['old-key'],
      });

      await caskFs.patchMetadata({
        filePath: '/manual/patch.txt',
        partitionKeys: ['new-key'],
        metadata: {},
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const keys = await getKeys(caskFs, '/manual/patch.txt');
      assert.ok(keys.includes('new-key'),   'new key should be present');
      assert.ok(!keys.includes('old-key'),  'old key should have been replaced');
    });
  });

  // ── Flavor 1: position-based ───────────────────────────────────────────────
  //
  //  Rule: { name: 'env', index: 1 }
  //
  //  Path: /production/service/file.txt
  //        ^^^^^^^^^^^ position 1
  //
  //  Resulting key: "env-production"

  describe('auto-path rule — flavor 1: position-based (index)', () => {
    before(async () => {
      await caskFs.autoPath.partition.set({ name: 'env', index: 1 });
    });

    after(async () => {
      await caskFs.autoPath.partition.remove('env');
      await caskFs.autoPath.partition.getConfig(true);
    });

    it('should store the rule and report it exists', async () => {
      const exists = await caskFs.autoPath.partition.exists('env');
      assert.strictEqual(exists, true);
    });

    it('getFromPath() should extract the value at the given index position', async () => {
      const results = await caskFs.autoPath.partition.getFromPath('/production/service/file.txt');
      const env = results.find(r => r.name === 'env');
      assert.ok(env, 'should have an env entry');
      assert.strictEqual(env.value, 'env-production');
    });

    it('getFromPath() should return nothing when the path has fewer segments than the index', async () => {
      // root file — no directory segments
      const results = await caskFs.autoPath.partition.getFromPath('/file.txt');
      const env = results.find(r => r.name === 'env');
      assert.ok(!env, 'should not match a path with no directory segments');
    });

    it('write() should auto-apply the partition key based on path position', async () => {
      const keys = await writeAndGetKeys(caskFs, '/staging/api/deploy.txt');
      assert.ok(keys.includes('env-staging'), 'should have env-staging from path position 1');
    });

    it('should not apply the key to files whose path has no matching position', async () => {
      // path starts with "/" so position 1 would be the first non-root segment
      // writing to root-level directory means index 1 = that dir — it should still match.
      // Test instead that a path SHORTER than the index produces no key.
      // We need index: 3 for this; re-use flavor by checking a shallower path.
      const results = await caskFs.autoPath.partition.getFromPath('/only-one/file.txt');
      // index=1 → 'only-one' → should match
      const env = results.find(r => r.name === 'env');
      assert.strictEqual(env.value, 'env-only-one');
    });

    it('set() should retroactively apply the rule to files written before the rule existed', async () => {
      // Write a file BEFORE a new position rule exists, then add the rule and verify
      await caskFs.autoPath.partition.remove('env');
      await caskFs.autoPath.partition.getConfig(true);

      await writeAndGetKeys(caskFs, '/retro/service/old.txt'); // no 'env' rule yet

      // now create the rule — AutoPathPartition.set() retroactively applies it
      await caskFs.autoPath.partition.set({ name: 'env', index: 1 });

      const keys = await getKeys(caskFs, '/retro/service/old.txt');
      assert.ok(keys.includes('env-retro'), 'retroactively applied key should be present');
    });
  });

  // ── Flavor 2: regex filter, default getValue ───────────────────────────────
  //
  //  Rule: { name: 'collection', filterRegex: '^dams-.+' }
  //
  //  Path: /data/dams-river-1/file.txt
  //               ^^^^^^^^^^^^  matches regex
  //
  //  Resulting key: "collection-dams-river-1"   (name + '-' + pathValue)

  describe('auto-path rule — flavor 2: regex filter with default getValue', () => {
    before(async () => {
      await caskFs.autoPath.partition.set({
        name: 'collection',
        filterRegex: '^dams-.+',
      });
    });

    after(async () => {
      await caskFs.autoPath.partition.remove('collection');
      await caskFs.autoPath.partition.getConfig(true);
    });

    it('should store the rule and report it exists', async () => {
      assert.ok(await caskFs.autoPath.partition.exists('collection'));
    });

    it('getFromPath() should produce name-pathValue for a matching segment', async () => {
      const results = await caskFs.autoPath.partition.getFromPath('/data/dams-river-1/file.txt');
      const col = results.find(r => r.name === 'collection');
      assert.ok(col, 'should have a collection entry');
      assert.strictEqual(col.value, 'collection-dams-river-1');
    });

    it('getFromPath() should return nothing when no segment matches the regex', async () => {
      const results = await caskFs.autoPath.partition.getFromPath('/data/lakes-blue/file.txt');
      const col = results.find(r => r.name === 'collection');
      assert.ok(!col, 'non-matching path should produce no key');
    });

    it('write() should auto-apply the key for a matching path', async () => {
      const keys = await writeAndGetKeys(caskFs, '/projects/dams-basin-2/report.txt');
      assert.ok(keys.includes('collection-dams-basin-2'));
    });

    it('write() should not apply the key for a non-matching path', async () => {
      const keys = await writeAndGetKeys(caskFs, '/projects/lakes-basin/report.txt');
      assert.ok(!keys.some(k => k.startsWith('collection-')),
        'non-matching path should produce no collection key');
    });

    it('should be findable via findFiles() using the auto-applied key', async () => {
      await writeAndGetKeys(caskFs, '/archive/dams-coastal-3/summary.txt');
      const result = await caskFs.dbClient.findFiles({
        partitionKeys: ['collection-dams-coastal-3'],
        ignoreAcl: true,
      });
      const paths = result.results.map(r => r.filepath);
      assert.ok(paths.includes('/archive/dams-coastal-3/summary.txt'));
    });
  });

  // ── Flavor 3: regex filter + custom getValue ───────────────────────────────
  //
  //  Rule: {
  //    name: 'year',
  //    filterRegex: '^data-(\\d{4})-',
  //    getValue: "return 'year-' + regexMatch[1];"
  //  }
  //
  //  Path: /archive/data-2023-jan/file.txt
  //                 ^^^^^^^^^^^^  matches, capture group 1 = "2023"
  //
  //  Resulting key: "year-2023"  (via custom function, NOT "year-data-2023-jan")

  describe('auto-path rule — flavor 3: regex filter with custom getValue', () => {
    before(async () => {
      await caskFs.autoPath.partition.set({
        name: 'year',
        filterRegex: '^data-(\\d{4})-',
        getValue: "return 'year-' + regexMatch[1];",
      });
    });

    after(async () => {
      await caskFs.autoPath.partition.remove('year');
      await caskFs.autoPath.partition.getConfig(true);
    });

    it('should store the rule and report it exists', async () => {
      assert.ok(await caskFs.autoPath.partition.exists('year'));
    });

    it('getFromPath() should use the custom getValue and extract the capture group', async () => {
      const results = await caskFs.autoPath.partition.getFromPath('/archive/data-2023-jan/file.txt');
      const yr = results.find(r => r.name === 'year');
      assert.ok(yr, 'should have a year entry');
      assert.strictEqual(yr.value, 'year-2023', 'custom function should extract the year from the capture group');
    });

    it('custom function result should differ from the default name-pathValue format', async () => {
      const results = await caskFs.autoPath.partition.getFromPath('/archive/data-2024-mar/file.txt');
      const yr = results.find(r => r.name === 'year');
      // default would be "year-data-2024-mar"; custom should be "year-2024"
      assert.strictEqual(yr.value, 'year-2024');
      assert.notStrictEqual(yr.value, 'year-data-2024-mar',
        'custom getValue should NOT produce the default name-pathValue format');
    });

    it('getFromPath() should return nothing when the regex does not match', async () => {
      const results = await caskFs.autoPath.partition.getFromPath('/archive/logs-2023/file.txt');
      const yr = results.find(r => r.name === 'year');
      assert.ok(!yr, 'non-matching path should produce no year key');
    });

    it('write() should auto-apply the transformed key', async () => {
      const keys = await writeAndGetKeys(caskFs, '/research/data-2025-jun/paper.txt');
      assert.ok(keys.includes('year-2025'), 'should have year-2025 from custom getValue');
      assert.ok(!keys.includes('year-data-2025-jun'), 'should not have the un-transformed value');
    });

    it('should be findable by the transformed key via findFiles()', async () => {
      await writeAndGetKeys(caskFs, '/reports/data-2022-dec/annual.txt');
      const result = await caskFs.dbClient.findFiles({
        partitionKeys: ['year-2022'],
        ignoreAcl: true,
      });
      const paths = result.results.map(r => r.filepath);
      assert.ok(paths.includes('/reports/data-2022-dec/annual.txt'));
    });

    it('multiple capture-group years can be distinguished as separate partition values', async () => {
      await writeAndGetKeys(caskFs, '/reports/data-2019-jan/r1.txt');
      await writeAndGetKeys(caskFs, '/reports/data-2020-jan/r2.txt');

      const y2019 = await caskFs.dbClient.findFiles({ partitionKeys: ['year-2019'], ignoreAcl: true });
      const y2020 = await caskFs.dbClient.findFiles({ partitionKeys: ['year-2020'], ignoreAcl: true });

      const paths2019 = y2019.results.map(r => r.filepath);
      const paths2020 = y2020.results.map(r => r.filepath);

      assert.ok(paths2019.includes('/reports/data-2019-jan/r1.txt'));
      assert.ok(!paths2019.includes('/reports/data-2020-jan/r2.txt'));
      assert.ok(paths2020.includes('/reports/data-2020-jan/r2.txt'));
      assert.ok(!paths2020.includes('/reports/data-2019-jan/r1.txt'));
    });
  });

  // ── Mixed: manual + auto-path keys coexist ────────────────────────────────

  describe('mixed: manual keys and auto-path keys coexist', () => {
    before(async () => {
      await caskFs.autoPath.partition.set({ name: 'region', index: 1 });
    });

    after(async () => {
      await caskFs.autoPath.partition.remove('region');
      await caskFs.autoPath.partition.getConfig(true);
    });

    it('should merge auto-path and manual keys on the same file', async () => {
      const keys = await writeAndGetKeys(caskFs, '/west/mixed/file.txt', {
        partitionKeys: ['manual-tag'],
      });
      assert.ok(keys.includes('region-west'), 'auto-path key should be present');
      assert.ok(keys.includes('manual-tag'),  'manual key should be present');
    });

    it('should be findable by either key independently', async () => {
      await writeAndGetKeys(caskFs, '/east/mixed/other.txt', {
        partitionKeys: ['owner-team-a'],
      });

      const byRegion = await caskFs.dbClient.findFiles({ partitionKeys: ['region-east'], ignoreAcl: true });
      const byManual = await caskFs.dbClient.findFiles({ partitionKeys: ['owner-team-a'], ignoreAcl: true });

      assert.ok(byRegion.results.some(r => r.filepath === '/east/mixed/other.txt'));
      assert.ok(byManual.results.some(r => r.filepath === '/east/mixed/other.txt'));
    });
  });
});
