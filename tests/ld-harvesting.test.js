import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';
import config from '../src/lib/config.js';

const TEST_USER = 'test-user';

/**
 * Covers the opt-in Linked Data Harvesting Configuration (see docs/ld.md):
 * filter harvesting (type/subject/predicate/object/graph -> file_ld_filter, used by find())
 * and link harvesting (predicate/object pairs -> file_ld_link, used by relationships()).
 *
 * Each describe block mutates caskFs.rdf.filterUris/filterUriMatches/linkPredicates/
 * linkPredicateMatches directly (bypassing env/config parsing, which only happens once
 * at module load) immediately before writing its own fixture(s), then restores nothing —
 * mocha runs each nested describe's before() only right before its own its(), so the
 * groups never interfere with each other.
 */
describe('Linked Data Harvesting Configuration', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  describe('nothing configured (default opt-out)', () => {
    const SUBJECT_URI = 'https://example.org/harvest/none/subject1';
    const TYPE_URI = 'http://schema.org/HarvestNoneType';
    const PREDICATE_URI = 'http://schema.org/harvestNonePredicate';
    const OBJECT_URI = 'https://example.org/harvest/none/object1';
    const FILE_PATH = '/harvesting/none/file1.jsonld.json';

    before(async () => {
      caskFs.rdf.filterUris = new Set();
      caskFs.rdf.filterUriMatches = [];
      caskFs.rdf.linkPredicates = new Set();
      caskFs.rdf.linkPredicateMatches = [];

      await caskFs.write({
        filePath: FILE_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': SUBJECT_URI,
          '@type': TYPE_URI,
          [PREDICATE_URI]: { '@id': OBJECT_URI }
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should not find the file by type', async () => {
      const result = await caskFs.rdf.find({ type: TYPE_URI });
      assert.strictEqual(result.totalCount, 0);
    });

    it('should not find the file by subject', async () => {
      const result = await caskFs.rdf.find({ subject: SUBJECT_URI });
      assert.strictEqual(result.totalCount, 0);
    });

    it('should not find the file by predicate', async () => {
      const result = await caskFs.rdf.find({ predicate: PREDICATE_URI });
      assert.strictEqual(result.totalCount, 0);
    });

    it('should not find the file by object', async () => {
      const result = await caskFs.rdf.find({ object: OBJECT_URI });
      assert.strictEqual(result.totalCount, 0);
    });

    it('should report no outbound/inbound links for the predicate/object pair', async () => {
      const rel = await caskFs.relationships({ filePath: FILE_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.strictEqual(rel.outbound[PREDICATE_URI], undefined);
    });
  });

  describe('exact URI opt-in — all filter types', () => {
    const SUBJECT_URI = 'https://example.org/harvest/exact/subject1';
    const TYPE_URI = 'http://schema.org/HarvestExactType';
    const OTHER_TYPE_URI = 'http://schema.org/HarvestExactTypeNotAllowed';
    const PREDICATE_URI = 'http://schema.org/harvestExactPredicate';
    const OTHER_PREDICATE_URI = 'http://schema.org/harvestExactPredicateNotAllowed';
    const OBJECT_URI = 'https://example.org/harvest/exact/object1';
    const FILE_PATH = '/harvesting/exact/file1.jsonld.json';

    before(async () => {
      caskFs.rdf.filterUris = new Set([TYPE_URI, SUBJECT_URI, PREDICATE_URI, OBJECT_URI]);
      caskFs.rdf.filterUriMatches = [];

      await caskFs.write({
        filePath: FILE_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': SUBJECT_URI,
          '@type': [TYPE_URI, OTHER_TYPE_URI],
          [PREDICATE_URI]: { '@id': OBJECT_URI },
          [OTHER_PREDICATE_URI]: 'not allow-listed'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should find the file by the allow-listed type', async () => {
      const result = await caskFs.rdf.find({ type: TYPE_URI });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, FILE_PATH);
    });

    it('should not find the file by a type that is not allow-listed', async () => {
      const result = await caskFs.rdf.find({ type: OTHER_TYPE_URI });
      assert.strictEqual(result.totalCount, 0);
    });

    it('should find the file by the allow-listed subject', async () => {
      const result = await caskFs.rdf.find({ subject: SUBJECT_URI });
      assert.strictEqual(result.totalCount, 1);
    });

    it('should find the file by the allow-listed predicate', async () => {
      const result = await caskFs.rdf.find({ predicate: PREDICATE_URI });
      assert.strictEqual(result.totalCount, 1);
    });

    it('should not find the file by a predicate that is not allow-listed', async () => {
      const result = await caskFs.rdf.find({ predicate: OTHER_PREDICATE_URI });
      assert.strictEqual(result.totalCount, 0);
    });

    it('should find the file by the allow-listed object', async () => {
      const result = await caskFs.rdf.find({ object: OBJECT_URI });
      assert.strictEqual(result.totalCount, 1);
    });
  });

  describe('regex opt-in — all filter types', () => {
    const NAMESPACE = 'https://example.org/harvest-regex/';
    const SUBJECT_URI = NAMESPACE + 'subject1';
    const TYPE_URI = NAMESPACE + 'Type';
    const PREDICATE_URI = NAMESPACE + 'predicate';
    const OBJECT_URI = NAMESPACE + 'object1';
    const UNMATCHED_PREDICATE_URI = 'http://schema.org/harvestRegexNotMatched';
    const FILE_PATH = '/harvesting/regex/file1.jsonld.json';

    before(async () => {
      caskFs.rdf.filterUris = new Set();
      caskFs.rdf.filterUriMatches = [new RegExp('^' + NAMESPACE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))];

      await caskFs.write({
        filePath: FILE_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': SUBJECT_URI,
          '@type': TYPE_URI,
          [PREDICATE_URI]: { '@id': OBJECT_URI },
          [UNMATCHED_PREDICATE_URI]: 'outside the namespace'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should find the file by the regex-matched type', async () => {
      const result = await caskFs.rdf.find({ type: TYPE_URI });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, FILE_PATH);
    });

    it('should find the file by the regex-matched subject', async () => {
      const result = await caskFs.rdf.find({ subject: SUBJECT_URI });
      assert.strictEqual(result.totalCount, 1);
    });

    it('should find the file by the regex-matched predicate', async () => {
      const result = await caskFs.rdf.find({ predicate: PREDICATE_URI });
      assert.strictEqual(result.totalCount, 1);
    });

    it('should find the file by the regex-matched object', async () => {
      const result = await caskFs.rdf.find({ object: OBJECT_URI });
      assert.strictEqual(result.totalCount, 1);
    });

    it('should not find the file by a predicate outside the regex namespace', async () => {
      const result = await caskFs.rdf.find({ predicate: UNMATCHED_PREDICATE_URI });
      assert.strictEqual(result.totalCount, 0);
    });
  });

  describe('graph opt-in', () => {
    const ON_PATH = '/harvesting/graph/on.jsonld.json';
    const OFF_PATH = '/harvesting/graph/off.jsonld.json';

    before(async () => {
      // every LD file already carries a `cask:/file` graph via the internal cask file node —
      // opting that graph URI in should make it a searchable facet
      caskFs.rdf.filterUris = new Set([config.fileGraph]);
      caskFs.rdf.filterUriMatches = [];

      await caskFs.write({
        filePath: ON_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': 'https://example.org/harvest/graph/on',
          '@type': 'http://schema.org/Thing'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      caskFs.rdf.filterUris = new Set();

      await caskFs.write({
        filePath: OFF_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': 'https://example.org/harvest/graph/off',
          '@type': 'http://schema.org/Thing'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should find only the file written while the graph URI was allow-listed', async () => {
      const result = await caskFs.rdf.find({ graph: config.fileGraph });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, ON_PATH);
    });
  });

  describe('resolved URI matching (relative cask:/ references)', () => {
    const SOURCE_PATH = '/harvesting/resolve/a.jsonld.json';
    // _resolveIdPath resolves relative to path.dirname(SOURCE_PATH), which already carries
    // a leading slash, so the resolved form doubles up the schemaPrefix's trailing slash
    const RESOLVED_OBJECT_URI = config.schemaPrefix + '/harvesting/resolve/b.jsonld.json';
    const RAW_OBJECT_VALUE = 'cask:/./b.jsonld.json';

    before(async () => {
      caskFs.rdf.filterUris = new Set([RESOLVED_OBJECT_URI]);
      caskFs.rdf.filterUriMatches = [];

      await caskFs.write({
        filePath: SOURCE_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': 'https://example.org/harvest/resolve/a',
          '@type': 'http://schema.org/Thing',
          'http://schema.org/pointsTo': { '@id': RAW_OBJECT_VALUE }
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should find the file by the fully-resolved cask:// object URI', async () => {
      const result = await caskFs.rdf.find({ object: RESOLVED_OBJECT_URI });
      assert.strictEqual(result.totalCount, 1);
      assert.strictEqual(result.results[0].filepath, SOURCE_PATH);
    });

    it('should not find the file by the raw, pre-resolution reference string', async () => {
      const result = await caskFs.rdf.find({ object: RAW_OBJECT_VALUE });
      assert.strictEqual(result.totalCount, 0);
    });
  });

  describe('link harvesting — exact predicate opt-in', () => {
    const SOURCE_URI = 'https://example.org/harvest/link-exact/source';
    const TARGET_URI = 'https://example.org/harvest/link-exact/target';
    const SOURCE_PATH = '/harvesting/link-exact/source.jsonld.json';
    const TARGET_PATH = '/harvesting/link-exact/target.jsonld.json';
    const LINKED_PREDICATE = 'http://schema.org/harvestLinkAuthor';
    const UNLINKED_PREDICATE = 'http://schema.org/harvestLinkEditor';

    before(async () => {
      // the target's subject must be filterable for relationships() to resolve the
      // linked object URI back to the file that owns it (see getInboundLinks/getOutboundLinks)
      caskFs.rdf.filterUris = new Set([TARGET_URI]);
      caskFs.rdf.filterUriMatches = [];
      caskFs.rdf.linkPredicates = new Set([LINKED_PREDICATE]);
      caskFs.rdf.linkPredicateMatches = [];

      await caskFs.write({
        filePath: TARGET_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': TARGET_URI,
          '@type': 'http://schema.org/Thing',
          // a quad whose predicate is rdf:type is skipped entirely from filter harvesting
          // (including its subject), so the target needs a non-type property for its own
          // subject URI to become filterable — required for relationships() to resolve links
          'http://schema.org/name': 'Link Target'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      await caskFs.write({
        filePath: SOURCE_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': SOURCE_URI,
          '@type': 'http://schema.org/Thing',
          [LINKED_PREDICATE]: { '@id': TARGET_URI },
          [UNLINKED_PREDICATE]: { '@id': TARGET_URI }
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should report an outbound link via the opted-in predicate', async () => {
      const rel = await caskFs.relationships({ filePath: SOURCE_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.ok(Array.isArray(rel.outbound[LINKED_PREDICATE]), 'expected an outbound array for the linked predicate');
      assert.ok(rel.outbound[LINKED_PREDICATE].includes(TARGET_PATH));
    });

    it('should not report an outbound link via the predicate that was not opted in', async () => {
      const rel = await caskFs.relationships({ filePath: SOURCE_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.strictEqual(rel.outbound[UNLINKED_PREDICATE], undefined);
    });

    it('should report an inbound link on the target via the opted-in predicate', async () => {
      const rel = await caskFs.relationships({ filePath: TARGET_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.ok(Array.isArray(rel.inbound[LINKED_PREDICATE]), 'expected an inbound array for the linked predicate');
      assert.ok(rel.inbound[LINKED_PREDICATE].includes(SOURCE_PATH));
    });

    it('should not report an inbound link via the predicate that was not opted in', async () => {
      const rel = await caskFs.relationships({ filePath: TARGET_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.strictEqual(rel.inbound[UNLINKED_PREDICATE], undefined);
    });
  });

  describe('link harvesting — regex predicate opt-in', () => {
    const SOURCE_URI = 'https://example.org/harvest/link-regex/source';
    const TARGET_URI = 'https://example.org/harvest/link-regex/target';
    const SOURCE_PATH = '/harvesting/link-regex/source.jsonld.json';
    const TARGET_PATH = '/harvesting/link-regex/target.jsonld.json';
    const LINKED_PREDICATE = 'http://schema.org/harvestRegexLink';
    const UNLINKED_PREDICATE = 'http://schema.org/harvestOtherRelation';

    before(async () => {
      caskFs.rdf.filterUris = new Set([TARGET_URI]);
      caskFs.rdf.filterUriMatches = [];
      caskFs.rdf.linkPredicates = new Set();
      caskFs.rdf.linkPredicateMatches = [/harvestRegexLink$/];

      await caskFs.write({
        filePath: TARGET_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': TARGET_URI,
          '@type': 'http://schema.org/Thing',
          // see note in the "exact predicate opt-in" group above — a type-only subject
          // never becomes filterable, so relationships() couldn't resolve the link
          'http://schema.org/name': 'Link Target'
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      await caskFs.write({
        filePath: SOURCE_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': SOURCE_URI,
          '@type': 'http://schema.org/Thing',
          [LINKED_PREDICATE]: { '@id': TARGET_URI },
          [UNLINKED_PREDICATE]: { '@id': TARGET_URI }
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should report an outbound link via the regex-matched predicate', async () => {
      const rel = await caskFs.relationships({ filePath: SOURCE_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.ok(Array.isArray(rel.outbound[LINKED_PREDICATE]));
      assert.ok(rel.outbound[LINKED_PREDICATE].includes(TARGET_PATH));
    });

    it('should not report an outbound link via a predicate that does not match the regex', async () => {
      const rel = await caskFs.relationships({ filePath: SOURCE_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.strictEqual(rel.outbound[UNLINKED_PREDICATE], undefined);
    });
  });
});
