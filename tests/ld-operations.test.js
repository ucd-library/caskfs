import assert from 'assert';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { setup, teardown } from './helpers/setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures/ld');

const TEST_USER = 'test-user';

// Canonical URIs used across fixture files
const ALICE_URI = 'https://example.org/person/alice';
const BOB_URI = 'https://example.org/person/bob';
const PUB1_URI = 'https://example.org/pub/1';
const PUB2_URI = 'https://example.org/pub/2';
const SCHEMA_PERSON = 'http://schema.org/Person';
const SCHEMA_ARTICLE = 'http://schema.org/ScholarlyArticle';
const SCHEMA_AUTHOR = 'http://schema.org/author';
const SCHEMA_NAME = 'http://schema.org/name';

// CaskFS paths for each fixture file
const ALICE_PATH = '/people/person-alice.jsonld.json';
const BOB_PATH = '/people/person-bob.jsonld.json';
const PUB1_PATH = '/publications/pub1.jsonld.json';
const PUB2_PATH = '/publications/pub2.jsonld.json';

// Partitioned LD fixtures for literal partition-key filter tests
const PARTA_PATH = '/partitioned/part-a.jsonld.json';
const PARTB_PATH = '/partitioned/part-b.jsonld.json';
const PARTA_URI  = 'https://example.org/part/a';
const PARTB_URI  = 'https://example.org/part/b';
const PART_KEY   = 'partition-x';

// Helper to get sorted filepaths from a find result
const filepaths = (result) => result.results.map(r => r.filepath).sort();

// Helper to extract literal values from a getLiteralValues result
const literalValues = (result) => result.results.map(r => r.object).sort();

describe('Linked Data Operations', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();

    // Write all fixture files. The .jsonld.json extension triggers auto-detection as RDF.
    const fixtures = [
      { filePath: ALICE_PATH, readPath: path.join(FIXTURES_DIR, 'people/person-alice.jsonld.json') },
      { filePath: BOB_PATH,   readPath: path.join(FIXTURES_DIR, 'people/person-bob.jsonld.json') },
      { filePath: PUB1_PATH,  readPath: path.join(FIXTURES_DIR, 'publications/pub1.jsonld.json') },
      { filePath: PUB2_PATH,  readPath: path.join(FIXTURES_DIR, 'publications/pub2.jsonld.json') },
    ];

    for (const f of fixtures) {
      const ctx = await caskFs.write({ ...f, requestor: TEST_USER, ignoreAcl: true });
      assert.ok(!ctx.data.error, `Failed to write ${f.filePath}: ${ctx.data.error?.message}`);
      assert.ok(ctx.data.actions.detectedLd, `${f.filePath} should be detected as RDF`);
    }

    // Partitioned LD files — used by the literal partition-key tests
    const partFixtures = [
      {
        filePath: PARTA_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': PARTA_URI,
          '@type': 'http://schema.org/Thing',
          'http://schema.org/name': 'Part A'
        })),
        partitionKeys: [PART_KEY]
      },
      {
        filePath: PARTB_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': PARTB_URI,
          '@type': 'http://schema.org/Thing',
          'http://schema.org/name': 'Part B'
        })),
        partitionKeys: [PART_KEY]
      }
    ];

    for (const f of partFixtures) {
      const ctx = await caskFs.write({ ...f, requestor: TEST_USER, ignoreAcl: true });
      assert.ok(!ctx.data.error, `Failed to write ${f.filePath}: ${ctx.data.error?.message}`);
      assert.ok(ctx.data.actions.detectedLd, `${f.filePath} should be detected as RDF`);
    }
  });

  after(async () => {
    await teardown();
  });

  // ─── find() ────────────────────────────────────────────────────────────────

  describe('rdf.find() — by type', () => {
    it('should find Person files by rdf:type', async () => {
      const result = await caskFs.rdf.find({ type: SCHEMA_PERSON });
      assert.strictEqual(result.totalCount, 2);
      assert.deepStrictEqual(filepaths(result), [ALICE_PATH, BOB_PATH]);
    });

    it('should find ScholarlyArticle files by rdf:type', async () => {
      const result = await caskFs.rdf.find({ type: SCHEMA_ARTICLE });
      assert.strictEqual(result.totalCount, 2);
      assert.deepStrictEqual(filepaths(result), [PUB1_PATH, PUB2_PATH]);
    });
  });

  describe('rdf.find() — by subject', () => {
    it('should find the file whose subject is Alice\'s URI', async () => {
      const result = await caskFs.rdf.find({ subject: ALICE_URI });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, ALICE_PATH);
    });

    it('should find the file whose subject is pub1\'s URI', async () => {
      const result = await caskFs.rdf.find({ subject: PUB1_URI });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, PUB1_PATH);
    });
  });

  describe('rdf.find() — by object', () => {
    it('should find publications that reference Alice as an object', async () => {
      const result = await caskFs.rdf.find({ object: ALICE_URI });
      assert.ok(result.totalCount >= 2, `expected ≥2 results, got ${result.totalCount}`);
      const paths = filepaths(result);
      assert.ok(paths.includes(PUB1_PATH), 'pub1 should reference Alice');
      assert.ok(paths.includes(PUB2_PATH), 'pub2 should reference Alice');
    });

    it('should find only pub1 when filtering by Bob as object', async () => {
      const result = await caskFs.rdf.find({ object: BOB_URI });
      assert.ok(result.totalCount >= 1);
      const paths = filepaths(result);
      assert.ok(paths.includes(PUB1_PATH), 'pub1 should reference Bob');
      assert.ok(!paths.includes(PUB2_PATH), 'pub2 should not reference Bob');
    });
  });

  describe('rdf.find() — by predicate', () => {
    it('should find files that use schema:author predicate', async () => {
      const result = await caskFs.rdf.find({ predicate: SCHEMA_AUTHOR });
      assert.strictEqual(result.totalCount, 2);
      assert.deepStrictEqual(filepaths(result), [PUB1_PATH, PUB2_PATH]);
    });

    it('should find files that use schema:name predicate', async () => {
      const result = await caskFs.rdf.find({ predicate: SCHEMA_NAME });
      // All 4 files have a schema:name literal (checked via ld_filter predicate index)
      assert.ok(result.totalCount >= 2);
    });
  });

  describe('rdf.find() — combined filters', () => {
    it('should intersect subject + type filters to pinpoint Alice\'s file', async () => {
      const result = await caskFs.rdf.find({ subject: ALICE_URI, type: SCHEMA_PERSON });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, ALICE_PATH);
    });

    it('should intersect object + type to find articles referencing Alice', async () => {
      const result = await caskFs.rdf.find({ object: ALICE_URI, type: SCHEMA_ARTICLE });
      assert.strictEqual(result.totalCount, 2);
      assert.deepStrictEqual(filepaths(result), [PUB1_PATH, PUB2_PATH]);
    });
  });

  // ─── rdf.read() ────────────────────────────────────────────────────────────

  describe('rdf.read()', () => {
    it('should return a JSON-LD dataset for pub1', async () => {
      const data = await caskFs.rdf.read({ filePath: PUB1_PATH });
      assert.ok(Array.isArray(data), 'should return an array (JSON-LD dataset)');
      assert.ok(data.length > 0, 'dataset should not be empty');
    });

    it('should include pub1\'s subject URI in the returned data', async () => {
      const data = await caskFs.rdf.read({ filePath: PUB1_PATH, format: 'nquads' });
      assert.ok(typeof data === 'string', 'nquads should be a string');
      assert.ok(data.includes(PUB1_URI), 'nquads should include pub1 URI');
    });

    it('should include cask metadata for the file in the dataset', async () => {
      const data = await caskFs.rdf.read({ filePath: PUB1_PATH, format: 'nquads' });
      // Every file gets a cask:// node with file metadata
      assert.ok(data.includes('cask:/'), 'nquads should include cask:// metadata');
    });

    it('should return a JSON-LD dataset for Alice\'s file', async () => {
      const data = await caskFs.rdf.read({ filePath: ALICE_PATH });
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
    });
  });

  // ─── relationships() ───────────────────────────────────────────────────────

  describe('relationships()', () => {
    it('pub1 should have outbound links to Alice and Bob\'s files via schema:author', async () => {
      const rel = await caskFs.relationships({
        filePath: PUB1_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(rel.outbound, 'should have outbound object');
      const outboundAuthorPaths = rel.outbound[SCHEMA_AUTHOR];
      assert.ok(Array.isArray(outboundAuthorPaths), 'schema:author outbound should be an array');
      assert.ok(outboundAuthorPaths.includes(ALICE_PATH), `outbound should include ${ALICE_PATH}`);
      assert.ok(outboundAuthorPaths.includes(BOB_PATH), `outbound should include ${BOB_PATH}`);
    });

    it('pub1 should have no inbound links (nothing references pub1\'s URI as an object)', async () => {
      const rel = await caskFs.relationships({
        filePath: PUB1_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.deepStrictEqual(rel.inbound, {});
    });

    it('Alice\'s file should have inbound links from both publications via schema:author', async () => {
      const rel = await caskFs.relationships({
        filePath: ALICE_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(rel.inbound, 'should have inbound object');
      const inboundAuthorPaths = rel.inbound[SCHEMA_AUTHOR];
      assert.ok(Array.isArray(inboundAuthorPaths), 'schema:author inbound should be an array');
      assert.ok(inboundAuthorPaths.includes(PUB1_PATH), `inbound should include ${PUB1_PATH}`);
      assert.ok(inboundAuthorPaths.includes(PUB2_PATH), `inbound should include ${PUB2_PATH}`);
    });

    it('Alice\'s file should have no outbound links (she doesn\'t reference other files as subjects)', async () => {
      const rel = await caskFs.relationships({
        filePath: ALICE_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.deepStrictEqual(rel.outbound, {});
    });

    it('relationship source metadata should be correctly populated', async () => {
      const rel = await caskFs.relationships({
        filePath: PUB1_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.strictEqual(rel.source.file, PUB1_PATH);
      assert.strictEqual(rel.source.resourceType, 'rdf');
      assert.strictEqual(rel.source.mimeType, 'application/ld+json');
    });
  });

  // ─── rdf.literal() / getLiteralValues() ────────────────────────────────────
  // 4 people/pub fixtures + 2 partitioned fixtures = 6 schema:name literals total.

  describe('literal() — no filter', () => {
    it('should return all literals when no filter is specified', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ ignoreAcl: true });
      assert.strictEqual(result.totalCount, 6);
      assert.strictEqual(result.results.length, 6);
    });

    it('should respect limit and return correct totalCount', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ limit: 2, ignoreAcl: true });
      assert.strictEqual(result.totalCount, 6);
      assert.strictEqual(result.results.length, 2);
      assert.strictEqual(result.limit, 2);
    });

    it('should respect offset for pagination', async () => {
      const all    = await caskFs.dbClient.getLiteralValues({ limit: 100, ignoreAcl: true });
      const paged  = await caskFs.dbClient.getLiteralValues({ limit: 2, offset: 2, ignoreAcl: true });
      assert.strictEqual(paged.results.length, 2);
      // the two paged values should differ from the first two
      const first2  = all.results.slice(0, 2).map(r => r.object);
      const paged2  = paged.results.map(r => r.object);
      assert.ok(!paged2.every(v => first2.includes(v)), 'offset should shift the result window');
    });
  });

  describe('literal() — filter by subject', () => {
    it('should return only Alice\'s name literal when filtering by her subject URI', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ subject: ALICE_URI, ignoreAcl: true });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].object, 'Alice Smith');
      assert.strictEqual(result.results[0].subject, ALICE_URI);
      assert.strictEqual(result.results[0].predicate, SCHEMA_NAME);
    });

    it('should return only pub1\'s literal when filtering by pub1 subject URI', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ subject: PUB1_URI, ignoreAcl: true });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].object, 'Advances in Content-Addressed Storage');
    });

    it('should return 0 results for an unknown subject URI', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        subject: 'https://example.org/unknown/nobody',
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 0);
      assert.strictEqual(result.results.length, 0);
    });
  });

  describe('literal() — filter by predicate', () => {
    it('should return all 6 literals when filtering by schema:name predicate', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ predicate: SCHEMA_NAME, ignoreAcl: true });
      assert.strictEqual(result.totalCount, 6);
      const values = literalValues(result);
      assert.ok(values.includes('Alice Smith'));
      assert.ok(values.includes('Bob Jones'));
      assert.ok(values.includes('Advances in Content-Addressed Storage'));
      assert.ok(values.includes('Knowledge Graphs in Practice'));
      assert.ok(values.includes('Part A'));
      assert.ok(values.includes('Part B'));
    });

    it('should return 0 results for an unused predicate', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        predicate: 'http://schema.org/description',
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 0);
    });
  });

  describe('literal() — filter by file', () => {
    it('should return only Alice\'s literals when filtering by her file path', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ filePath: ALICE_PATH, ignoreAcl: true });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].object, 'Alice Smith');
    });

    it('should return only pub1\'s literals when filtering by pub1 file path', async () => {
      const result = await caskFs.dbClient.getLiteralValues({ filePath: PUB1_PATH, ignoreAcl: true });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].object, 'Advances in Content-Addressed Storage');
    });

    it('should return 0 results for a non-existent file path', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        filePath: '/no/such/file.jsonld.json',
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 0);
    });
  });

  describe('literal() — filter by partition key', () => {
    it('should return only literals from partitioned files when filtering by partition key', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        partitionKeys: [PART_KEY],
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 2);
      const values = literalValues(result);
      assert.ok(values.includes('Part A'));
      assert.ok(values.includes('Part B'));
    });

    it('should return 0 results for an unknown partition key', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        partitionKeys: ['no-such-partition'],
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 0);
    });
  });

  describe('literal() — combined filters', () => {
    it('should intersect subject + predicate to return exactly one literal', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        subject: BOB_URI,
        predicate: SCHEMA_NAME,
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].object, 'Bob Jones');
    });

    it('should intersect file + predicate to return one literal', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        filePath: PUB2_PATH,
        predicate: SCHEMA_NAME,
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].object, 'Knowledge Graphs in Practice');
    });

    it('should intersect partition key + predicate to return partition literals', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        partitionKeys: [PART_KEY],
        predicate: SCHEMA_NAME,
        ignoreAcl: true
      });
      assert.strictEqual(result.totalCount, 2);
    });
  });

  describe('literal() — debugQuery', () => {
    it('should return SQL and args without executing when debugQuery is true', async () => {
      const result = await caskFs.dbClient.getLiteralValues({
        subject: ALICE_URI,
        debugQuery: true
      });
      assert.ok(typeof result.query === 'string', 'should return a query string');
      assert.ok(Array.isArray(result.args), 'should return args array');
      assert.ok(result.query.toLowerCase().includes('select'), 'query should contain SELECT');
      assert.ok(!result.results, 'should not have results when debugQuery is true');
    });
  });

  // ─── nq file lifecycle ─────────────────────────────────────────────────────

  describe('nq file lifecycle', () => {
    let hashes = {};

    before(async () => {
      for (const [key, filePath] of [
        ['alice', ALICE_PATH], ['bob', BOB_PATH],
        ['pub1', PUB1_PATH],   ['pub2', PUB2_PATH],
      ]) {
        const meta = await caskFs.metadata({ filePath, requestor: TEST_USER, ignoreAcl: true });
        hashes[key] = meta.hash_value;
      }
    });

    it('should have a .nq file on disk for every written LD fixture', async () => {
      for (const [key, hash] of Object.entries(hashes)) {
        const exists = await caskFs.cas.quadExists(hash);
        assert.ok(exists, `expected .nq file for ${key} (hash: ${hash})`);
      }
    });

    it("Alice's .nq file should contain her subject URI", async () => {
      const nquads = await caskFs.cas.readQuads(hashes.alice);
      assert.ok(nquads.includes(ALICE_URI), "Alice's .nq should contain her URI");
    });

    it("pub1's .nq file should contain its subject URI and schema:author predicate", async () => {
      const nquads = await caskFs.cas.readQuads(hashes.pub1);
      assert.ok(nquads.includes(PUB1_URI), "pub1's .nq should contain pub1 URI");
      assert.ok(nquads.includes(SCHEMA_AUTHOR), "pub1's .nq should contain schema:author");
    });

    it("pub1's .nq file should reference Alice and Bob as objects", async () => {
      const nquads = await caskFs.cas.readQuads(hashes.pub1);
      assert.ok(nquads.includes(ALICE_URI), "pub1's .nq should reference Alice");
      assert.ok(nquads.includes(BOB_URI), "pub1's .nq should reference Bob");
    });

    it('rdf.read() nquads output should include every line from the .nq file', async () => {
      const readResult = await caskFs.rdf.read({ filePath: PUB1_PATH, format: 'nquads' });
      const fileNquads = await caskFs.cas.readQuads(hashes.pub1);
      const fileLines = fileNquads.trim().split('\n').filter(Boolean);
      for (const line of fileLines) {
        assert.ok(readResult.includes(line.trim()), `rdf.read() missing nquad: ${line.trim().slice(0, 80)}`);
      }
    });

    it('rdf.read() should throw when the .nq file is missing', async () => {
      const tempPath = '/nq-missing-test/temp.jsonld.json';
      const ctx = await caskFs.write({
        filePath: tempPath,
        data: Buffer.from(JSON.stringify({
          '@id': 'https://example.org/temp/missing-nq',
          '@type': 'http://schema.org/Thing',
          'http://schema.org/name': 'Missing NQ Test'
        })),
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      const hash = ctx.data.file?.hash_value;

      // remove .nq file to simulate missing data
      await fsp.unlink(caskFs.cas.quadPath(hash));

      await assert.rejects(
        () => caskFs.rdf.read({ filePath: tempPath }),
        /Quad file not found/
      );

      // cleanup — delete the file record; the orphaned hash file is swept by teardown
      await caskFs.deleteFile({ filePath: tempPath, requestor: TEST_USER, ignoreAcl: true });
    });
  });

  describe('rdf.literal() — full pipeline', () => {
    it('should return formatted JSON-LD results via rdf.literal()', async () => {
      const result = await caskFs.rdf.literal({ subject: ALICE_URI, format: 'jsonld', ignoreAcl: true });
      assert.ok(result.totalCount === 1, 'should have totalCount of 1');
      assert.ok(Array.isArray(result.results), 'results should be an array');
      assert.ok(result.results.length > 0, 'should have at least one result item');
    });

    it('should return debugQuery passthrough from rdf.literal()', async () => {
      const result = await caskFs.rdf.literal({ subject: ALICE_URI, debugQuery: true });
      assert.ok(typeof result.query === 'string');
      assert.ok(Array.isArray(result.args));
    });
  });
});
