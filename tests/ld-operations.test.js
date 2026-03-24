import assert from 'assert';
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

// Helper to get sorted filepaths from a find result
const filepaths = (result) => result.results.map(r => r.filepath).sort();

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
});
