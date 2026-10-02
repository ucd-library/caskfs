import assert from 'assert';
import { Client } from 'pg';
import config from '../src/lib/config.js';
import { setup, teardown } from './helpers/setup.js';

const TEST_USER = 'test-user';

/**
 * @function countRows
 * @description Count all rows in a caskfs schema table.
 * @param {CaskFs} caskFs
 * @param {String} table
 * @returns {Promise<Number>}
 */
async function countRows(caskFs, table) {
  const resp = await caskFs.dbClient.query(`SELECT COUNT(*) AS count FROM ${config.database.schema}.${table}`);
  return parseInt(resp.rows[0].count);
}

/**
 * @function thingDoc
 * @description Build a minimal JSON-LD "Thing" document buffer for test fixtures.
 * @param {String} id subject URI
 * @param {Object} [opts={}]
 * @param {String} [opts.name] value for schema:name (produces an ld_literal row)
 * @param {String} [opts.relatedTo] URI value for schema:relatedTo (produces an ld_link row)
 * @returns {Buffer}
 */
function thingDoc(id, opts={}) {
  const doc = {
    '@id': id,
    '@type': 'http://schema.org/Thing'
  };
  if (opts.name) doc['http://schema.org/name'] = opts.name;
  if (opts.relatedTo) doc['http://schema.org/relatedTo'] = { '@id': opts.relatedTo };
  return Buffer.from(JSON.stringify(doc));
}

/**
 * @function rawPgClient
 * @description Open a raw node-postgres client against the test database, bypassing the
 * Database/CaskFs wrapper. Used for tests that need manual transaction/locking control.
 * @returns {Promise<Client>} connected client - caller must call .end()
 */
async function rawPgClient() {
  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database
  });
  await client.connect();
  return client;
}

describe('LD Cleanup', () => {
  let caskFs;
  let rdf;

  before(async () => {
    caskFs = await setup();
    rdf = caskFs.rdf;
  });

  after(async () => {
    await teardown();
  });

  describe('getUnusedLdOverview()', () => {
    it('should return all-zero counts on a clean database', async () => {
      const overview = await rdf.getUnusedLdOverview();
      assert.deepStrictEqual(overview, { ldFilter: 0, ldLink: 0, ldLiteral: 0, uri: 0 });
    });

    it('should not count rows that are still referenced by a live file', async () => {
      const filePath = '/ld-cleanup/live-overview.jsonld.json';
      const before = await rdf.getUnusedLdOverview();

      const ctx = await caskFs.write({
        filePath,
        data: thingDoc('https://example.org/ld-cleanup/live-overview', {
          name: 'Live Overview Thing',
          relatedTo: 'https://example.org/ld-cleanup/live-overview-related'
        }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      assert.ok(!ctx.data.error, `write failed: ${ctx.data.error?.message}`);

      const whileReferenced = await rdf.getUnusedLdOverview();
      assert.deepStrictEqual(whileReferenced, before, 'rows referenced by a live file should not be counted as unused');

      await caskFs.deleteFile({ filePath, requestor: TEST_USER, ignoreAcl: true });
    });

    it('should count ld_filter/ld_link/ld_literal rows that become unused once the only referencing file is deleted', async () => {
      const filePath = '/ld-cleanup/solo.jsonld.json';

      const before = await rdf.getUnusedLdOverview();

      const ctx = await caskFs.write({
        filePath,
        data: thingDoc('https://example.org/ld-cleanup/solo', {
          name: 'Solo Thing',
          relatedTo: 'https://example.org/ld-cleanup/solo-related'
        }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      assert.ok(!ctx.data.error, `write failed: ${ctx.data.error?.message}`);

      await caskFs.deleteFile({ filePath, requestor: TEST_USER, ignoreAcl: true });

      const after = await rdf.getUnusedLdOverview();
      assert.ok(
        after.ldLink > before.ldLink || after.ldLiteral > before.ldLiteral || after.ldFilter > before.ldFilter,
        `expected at least one unused count to increase after deleting the only referencing file, before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
      );
      assert.ok(after.uri >= before.uri, 'projected unused uri count should not decrease');
    });
  });

  describe('cross-reference safety', () => {
    it('should not treat a uri as unused while it is still referenced by any other file, across tables', async () => {
      const sharedUri = 'https://example.org/ld-cleanup/shared-' + Date.now();
      const pathA = '/ld-cleanup/shared-a.jsonld.json';
      const pathB = '/ld-cleanup/shared-b.jsonld.json';

      // doc A references sharedUri as a link object; doc B references it as a filter-type value.
      await caskFs.write({
        filePath: pathA,
        data: thingDoc('https://example.org/ld-cleanup/shared-doc-a', { relatedTo: sharedUri }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      await caskFs.write({
        filePath: pathB,
        data: Buffer.from(JSON.stringify({
          '@id': sharedUri,
          '@type': 'http://schema.org/Thing',
          'http://schema.org/name': 'Shared URI as its own subject'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      const uriRow = await caskFs.dbClient.query(
        `SELECT uri_id FROM ${config.database.schema}.uri WHERE uri = $1`, [sharedUri]
      );
      assert.strictEqual(uriRow.rows.length, 1, 'shared uri row should exist after both writes');
      const sharedUriId = uriRow.rows[0].uri_id;

      const isUnused = async () => {
        const resp = await caskFs.dbClient.query(
          `SELECT 1 FROM ${config.database.schema}.unused_uris WHERE uri_id = $1`, [sharedUriId]
        );
        return resp.rows.length > 0;
      };

      // deleting doc B removes the uri as a "subject", but doc A still links to it - must survive.
      await caskFs.deleteFile({ filePath: pathB, requestor: TEST_USER, ignoreAcl: true });
      assert.strictEqual(await isUnused(), false, 'shared uri should still be referenced by doc A (as a link object)');

      await caskFs.deleteFile({ filePath: pathA, requestor: TEST_USER, ignoreAcl: true });

      // Now that every referencing file is gone, the ld_filter/ld_link/ld_literal rows that
      // still point at sharedUri are themselves unused but not yet deleted - unused_uris won't
      // report the uri as unused until cleanupUnusedLd() actually removes those rows first.
      // This is the two-phase design getUnusedLdOverview()'s projection accounts for.
      assert.strictEqual(await isUnused(), false, 'uri should not be reported unused until the referencing ld_* rows are themselves cleaned up');

      const result = await rdf.cleanupUnusedLd({ batchSize: 100 });
      assert.strictEqual(result.uriDeleted > 0, true, 'expected the shared uri to be deleted once all referencing ld_* rows are cleaned up');

      const finalRow = await caskFs.dbClient.query(
        `SELECT 1 FROM ${config.database.schema}.uri WHERE uri_id = $1`, [sharedUriId]
      );
      assert.strictEqual(finalRow.rows.length, 0, 'shared uri row should be fully removed after cleanup');
    });
  });

  describe('cleanupUnusedLd()', () => {
    it('should delete only unused rows and leave rows referenced by a live file untouched', async () => {
      const livePath = '/ld-cleanup/live.jsonld.json';
      await caskFs.write({
        filePath: livePath,
        data: thingDoc('https://example.org/ld-cleanup/live', {
          name: 'Live Thing',
          relatedTo: 'https://example.org/ld-cleanup/live-related'
        }),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      const orphanPath = '/ld-cleanup/orphan.jsonld.json';
      await caskFs.write({
        filePath: orphanPath,
        data: thingDoc('https://example.org/ld-cleanup/orphan', {
          name: 'Orphan Thing',
          relatedTo: 'https://example.org/ld-cleanup/orphan-related'
        }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      await caskFs.deleteFile({ filePath: orphanPath, requestor: TEST_USER, ignoreAcl: true });

      const liveMeta = await caskFs.metadata({ filePath: livePath, requestor: TEST_USER, ignoreAcl: true });
      const liveFilterIds = (await caskFs.dbClient.query(
        `SELECT ld_filter_id FROM ${config.database.schema}.file_ld_filter WHERE file_id = $1`,
        [liveMeta.file_id]
      )).rows.map(r => r.ld_filter_id);
      const liveLinkIds = (await caskFs.dbClient.query(
        `SELECT ld_link_id FROM ${config.database.schema}.file_ld_link WHERE file_id = $1`,
        [liveMeta.file_id]
      )).rows.map(r => r.ld_link_id);
      const liveLiteralIds = (await caskFs.dbClient.query(
        `SELECT ld_literal_id FROM ${config.database.schema}.file_ld_literal WHERE file_id = $1`,
        [liveMeta.file_id]
      )).rows.map(r => r.ld_literal_id);

      const overview = await rdf.getUnusedLdOverview();
      assert.ok(
        overview.ldFilter > 0 || overview.ldLink > 0 || overview.ldLiteral > 0,
        'expected something unused to exist before cleanup'
      );

      const result = await rdf.cleanupUnusedLd({ batchSize: 2 });
      assert.strictEqual(typeof result.ldFilterDeleted, 'number');
      assert.strictEqual(typeof result.ldLinkDeleted, 'number');
      assert.strictEqual(typeof result.ldLiteralDeleted, 'number');
      assert.strictEqual(typeof result.uriDeleted, 'number');

      const afterOverview = await rdf.getUnusedLdOverview();
      assert.deepStrictEqual(afterOverview, { ldFilter: 0, ldLink: 0, ldLiteral: 0, uri: 0 });

      for (const id of liveFilterIds) {
        const resp = await caskFs.dbClient.query(`SELECT 1 FROM ${config.database.schema}.ld_filter WHERE ld_filter_id = $1`, [id]);
        assert.strictEqual(resp.rows.length, 1, `live ld_filter row ${id} should survive cleanup`);
      }
      for (const id of liveLinkIds) {
        const resp = await caskFs.dbClient.query(`SELECT 1 FROM ${config.database.schema}.ld_link WHERE ld_link_id = $1`, [id]);
        assert.strictEqual(resp.rows.length, 1, `live ld_link row ${id} should survive cleanup`);
      }
      for (const id of liveLiteralIds) {
        const resp = await caskFs.dbClient.query(`SELECT 1 FROM ${config.database.schema}.ld_literal WHERE ld_literal_id = $1`, [id]);
        assert.strictEqual(resp.rows.length, 1, `live ld_literal row ${id} should survive cleanup`);
      }

      await caskFs.deleteFile({ filePath: livePath, requestor: TEST_USER, ignoreAcl: true });
      await rdf.cleanupUnusedLd({ batchSize: 100 });
    });

    it('should delete an actual uriDeleted count matching the overview\'s projected uri count', async () => {
      const filePath = '/ld-cleanup/projection.jsonld.json';
      await caskFs.write({
        filePath,
        data: thingDoc('https://example.org/ld-cleanup/projection', { name: 'Projection Thing' }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      await caskFs.deleteFile({ filePath, requestor: TEST_USER, ignoreAcl: true });

      const projected = await rdf.getUnusedLdOverview();
      const result = await rdf.cleanupUnusedLd({ batchSize: 100 });

      assert.strictEqual(
        result.uriDeleted, projected.uri,
        'projected uri count from getUnusedLdOverview() should match the actual uriDeleted count when nothing else writes in between'
      );
    });

    it('should accept a custom statementTimeout and still complete correctly', async () => {
      const filePath = '/ld-cleanup/custom-timeout.jsonld.json';
      await caskFs.write({
        filePath,
        data: thingDoc('https://example.org/ld-cleanup/custom-timeout', { name: 'Custom Timeout Thing' }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      await caskFs.deleteFile({ filePath, requestor: TEST_USER, ignoreAcl: true });

      const overview = await rdf.getUnusedLdOverview();
      assert.ok(
        overview.ldFilter > 0 || overview.ldLink > 0 || overview.ldLiteral > 0,
        'expected something unused to exist before cleanup'
      );

      const result = await rdf.cleanupUnusedLd({ batchSize: 5, statementTimeout: 5 });
      assert.strictEqual(typeof result.ldFilterDeleted, 'number');

      const afterOverview = await rdf.getUnusedLdOverview();
      assert.deepStrictEqual(afterOverview, { ldFilter: 0, ldLink: 0, ldLiteral: 0, uri: 0 });
    });
  });

  describe('vacuumLdTables()', () => {
    it('should run without error and leave row counts unchanged', async () => {
      const tables = ['ld_filter', 'ld_link', 'ld_literal', 'uri', 'file_ld_filter', 'file_ld_link', 'file_ld_literal'];
      const before = {};
      for (const t of tables) before[t] = await countRows(caskFs, t);

      await rdf.vacuumLdTables();

      const after = {};
      for (const t of tables) after[t] = await countRows(caskFs, t);

      assert.deepStrictEqual(after, before);
    });
  });

  describe('concurrency / lock safety', () => {
    it('should block a concurrent uri insert while the uri-phase lock is held, and release it on commit', async () => {
      const schema = config.database.schema;
      const lockClient = await rawPgClient();
      const writerClient = await rawPgClient();

      try {
        await lockClient.query('BEGIN');
        await lockClient.query(
          `LOCK TABLE ${schema}.uri, ${schema}.ld_filter, ${schema}.ld_link, ${schema}.ld_literal IN SHARE ROW EXCLUSIVE MODE`
        );

        let writerResolved = false;
        const writerPromise = writerClient
          .query(`SELECT ${schema}.upsert_uri($1)`, ['https://example.org/ld-cleanup/concurrent-write-' + Date.now()])
          .then(() => { writerResolved = true; });

        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(writerResolved, false, 'concurrent uri insert should be blocked while the lock is held');

        await lockClient.query('COMMIT');
        await writerPromise;
        assert.strictEqual(writerResolved, true, 'concurrent uri insert should complete once the lock is released');
      } finally {
        await lockClient.end();
        await writerClient.end();
      }
    });

    it('should block a concurrent file_ld_filter insert while the ld_filter-phase lock is held', async () => {
      const schema = config.database.schema;

      // seed a live ld_filter row + file to reference it from the concurrent writer
      const filePath = '/ld-cleanup/lock-filter-target.jsonld.json';
      await caskFs.write({
        filePath,
        data: thingDoc('https://example.org/ld-cleanup/lock-filter-target', { name: 'Lock Filter Target' }),
        requestor: TEST_USER,
        ignoreAcl: true
      });
      const meta = await caskFs.metadata({ filePath, requestor: TEST_USER, ignoreAcl: true });

      const lockClient = await rawPgClient();
      const writerClient = await rawPgClient();

      try {
        await lockClient.query('BEGIN');
        await lockClient.query(
          `LOCK TABLE ${schema}.ld_filter, ${schema}.file_ld_filter IN SHARE ROW EXCLUSIVE MODE`
        );

        let writerResolved = false;
        const writerPromise = writerClient
          .query(`SELECT ${schema}.insert_file_ld_filter($1, 'type', $2)`, [meta.file_id, 'http://schema.org/Thing'])
          .then(() => { writerResolved = true; });

        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(writerResolved, false, 'concurrent file_ld_filter write should be blocked while the lock is held');

        await lockClient.query('COMMIT');
        await writerPromise;
        assert.strictEqual(writerResolved, true, 'concurrent file_ld_filter write should complete once the lock is released');
      } finally {
        await lockClient.end();
        await writerClient.end();
      }

      await caskFs.deleteFile({ filePath, requestor: TEST_USER, ignoreAcl: true });
      await rdf.cleanupUnusedLd({ batchSize: 100 });
    });
  });
});
