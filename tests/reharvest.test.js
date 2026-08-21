import assert from 'assert';
import path from 'path';
import { setup, teardown } from './helpers/setup.js';
import config from '../src/lib/config.js';

const TEST_USER = 'test-user';

/**
 * @function rawMoveFile
 * @description Rename a file at the database level only, bypassing CaskFs.moveFile()'s
 * automatic reharvest — simulates a move that hasn't been reharvested yet, so reharvest()
 * can be tested in isolation as its own primitive.
 */
async function rawMoveFile(caskFs, srcPath, destPath) {
  const srcMeta = await caskFs.metadata({ filePath: srcPath, requestor: TEST_USER, ignoreAcl: true });
  const destParts = path.parse(destPath);
  await caskFs.runInTransaction(async (dbClient) => {
    const directoryId = await caskFs.directory.mkdir(destParts.dir, { dbClient });
    await dbClient.renameFile({
      fileId: srcMeta.file_id,
      directoryId,
      name: destParts.base,
      user: TEST_USER
    });
  });
}

/**
 * @function rawMoveDirectory
 * @description Move a directory at the database level only, bypassing
 * CaskFs.moveDirectory()'s automatic reharvest.
 */
async function rawMoveDirectory(caskFs, srcDir, destPath) {
  const destParts = path.parse(destPath);
  await caskFs.runInTransaction(async (dbClient) => {
    const parentId = await caskFs.directory.mkdir(destParts.dir, { dbClient });
    await caskFs.directory.move({ directory: srcDir, destPath, parentId, dbClient });
  });
}

describe('reharvest()', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  describe('single file — fixes a stale self-reference after a raw move', () => {
    const OLD_PATH = '/reharvest/self/doc.jsonld.json';
    const NEW_PATH = '/reharvest/self/moved/doc.jsonld.json';
    const RESOLVED_OLD = config.schemaPrefix + '/reharvest/self/doc';
    const RESOLVED_NEW = config.schemaPrefix + '/reharvest/self/moved/doc';

    before(async () => {
      caskFs.rdf.filterUris = new Set([RESOLVED_OLD, RESOLVED_NEW]);
      caskFs.rdf.filterUriMatches = [];

      await caskFs.write({
        filePath: OLD_PATH,
        data: Buffer.from(JSON.stringify({
          '@id': 'https://example.org/reharvest/self',
          'http://schema.org/about': { '@id': 'cask:/' }
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });
    });

    it('should resolve to the original path before any move', async () => {
      const result = await caskFs.rdf.find({ object: RESOLVED_OLD });
      assert.strictEqual(result.totalCount, 1);
    });

    it('should still resolve to the old path immediately after a raw move (stale)', async () => {
      await rawMoveFile(caskFs, OLD_PATH, NEW_PATH);

      const stale = await caskFs.rdf.find({ object: RESOLVED_OLD });
      assert.strictEqual(stale.totalCount, 1, 'old reference should still be there, unfixed');

      const fresh = await caskFs.rdf.find({ object: RESOLVED_NEW });
      assert.strictEqual(fresh.totalCount, 0, 'new reference should not exist yet');
    });

    it('should resolve to the new path after reharvest()', async () => {
      const result = await caskFs.reharvest({ filePath: NEW_PATH, requestor: TEST_USER, ignoreAcl: true });
      assert.deepStrictEqual(result.reharvested, [NEW_PATH]);
      assert.deepStrictEqual(result.skipped, []);
      assert.deepStrictEqual(result.errors, []);

      const fresh = await caskFs.rdf.find({ object: RESOLVED_NEW });
      assert.strictEqual(fresh.totalCount, 1);

      const stale = await caskFs.rdf.find({ object: RESOLVED_OLD });
      assert.strictEqual(stale.totalCount, 0);
    });
  });

  describe('directory — reharvests rdf descendants, skips others', () => {
    const OLD_DIR = '/reharvest/dir';
    const NEW_DIR = '/reharvest/dir-moved';
    const RDF_NEW_PATH = NEW_DIR + '/doc.jsonld.json';
    const PLAIN_NEW_PATH = NEW_DIR + '/plain.txt';
    const RESOLVED_OLD = config.schemaPrefix + '/reharvest/dir/doc';
    const RESOLVED_NEW = config.schemaPrefix + '/reharvest/dir-moved/doc';

    before(async () => {
      caskFs.rdf.filterUris = new Set([RESOLVED_OLD, RESOLVED_NEW]);
      caskFs.rdf.filterUriMatches = [];

      await caskFs.write({
        filePath: OLD_DIR + '/doc.jsonld.json',
        data: Buffer.from(JSON.stringify({
          '@id': 'https://example.org/reharvest/dir-doc',
          'http://schema.org/about': { '@id': 'cask:/' }
        })),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      await caskFs.write({
        filePath: OLD_DIR + '/plain.txt',
        data: Buffer.from('just some text'),
        requestor: TEST_USER,
        ignoreAcl: true
      });

      await rawMoveDirectory(caskFs, OLD_DIR, NEW_DIR);
    });

    it('should leave the moved directory stale before reharvest', async () => {
      const stale = await caskFs.rdf.find({ object: RESOLVED_OLD });
      assert.strictEqual(stale.totalCount, 1);
    });

    it('should reharvest only the rdf file, skipping the plain file', async () => {
      const result = await caskFs.reharvest({ filePath: NEW_DIR, requestor: TEST_USER, ignoreAcl: true });

      assert.deepStrictEqual(result.reharvested, [RDF_NEW_PATH]);
      assert.deepStrictEqual(result.skipped, [PLAIN_NEW_PATH]);
      assert.deepStrictEqual(result.errors, []);

      const fresh = await caskFs.rdf.find({ object: RESOLVED_NEW });
      assert.strictEqual(fresh.totalCount, 1);
    });
  });
});

describe('moveFile()/moveDirectory() — automatic reharvest integration', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  it('moveFile() should fix a self-reference automatically, with no manual reharvest call', async () => {
    const OLD_PATH = '/mv-reharvest/doc.jsonld.json';
    const NEW_PATH = '/mv-reharvest/moved/doc.jsonld.json';
    const RESOLVED_OLD = config.schemaPrefix + '/mv-reharvest/doc';
    const RESOLVED_NEW = config.schemaPrefix + '/mv-reharvest/moved/doc';

    caskFs.rdf.filterUris = new Set([RESOLVED_OLD, RESOLVED_NEW]);
    caskFs.rdf.filterUriMatches = [];

    await caskFs.write({
      filePath: OLD_PATH,
      data: Buffer.from(JSON.stringify({
        '@id': 'https://example.org/mv-reharvest',
        'http://schema.org/about': { '@id': 'cask:/' }
      })),
      requestor: TEST_USER,
      ignoreAcl: true
    });

    const result = await caskFs.moveFile(
      { filePath: OLD_PATH, requestor: TEST_USER, ignoreAcl: true },
      { destPath: NEW_PATH }
    );

    assert.deepStrictEqual(result.reharvest.reharvested, [NEW_PATH]);

    const fresh = await caskFs.rdf.find({ object: RESOLVED_NEW });
    assert.strictEqual(fresh.totalCount, 1, 'reference should already be fixed with no manual reharvest call');
  });

  it('moveDirectory() should fix rdf descendants automatically', async () => {
    const OLD_DIR = '/mvd-reharvest/dir';
    const NEW_DIR = '/mvd-reharvest/dir-moved';
    const RESOLVED_NEW = config.schemaPrefix + '/mvd-reharvest/dir-moved/doc';

    caskFs.rdf.filterUris = new Set([RESOLVED_NEW]);
    caskFs.rdf.filterUriMatches = [];

    await caskFs.write({
      filePath: OLD_DIR + '/doc.jsonld.json',
      data: Buffer.from(JSON.stringify({
        '@id': 'https://example.org/mvd-reharvest',
        'http://schema.org/about': { '@id': 'cask:/' }
      })),
      requestor: TEST_USER,
      ignoreAcl: true
    });

    const result = await caskFs.moveDirectory(
      { directory: OLD_DIR, requestor: TEST_USER, ignoreAcl: true },
      { destPath: NEW_DIR }
    );

    assert.deepStrictEqual(result.reharvest.reharvested, [NEW_DIR + '/doc.jsonld.json']);

    const fresh = await caskFs.rdf.find({ object: RESOLVED_NEW });
    assert.strictEqual(fresh.totalCount, 1);
  });
});

describe('moveFile() — rename extension recheck edge case', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  it('flips resourceType to rdf on an extension change even without --recheck-mime-type, leaving mimeType untouched', async () => {
    const OLD_PATH = '/recheck/a.txt';
    const NEW_PATH = '/recheck/a.jsonld.json';

    await caskFs.write({
      filePath: OLD_PATH,
      data: Buffer.from(JSON.stringify({ '@id': 'https://example.org/recheck/a', '@type': 'http://schema.org/Thing' })),
      mimeType: 'text/plain',
      requestor: TEST_USER,
      ignoreAcl: true
    });

    const before = await caskFs.metadata({ filePath: OLD_PATH, requestor: TEST_USER, ignoreAcl: true });
    assert.strictEqual(before.metadata.resourceType, 'file');

    await caskFs.moveFile(
      { filePath: OLD_PATH, requestor: TEST_USER, ignoreAcl: true },
      { destPath: NEW_PATH }
    );

    const after = await caskFs.metadata({ filePath: NEW_PATH, requestor: TEST_USER, ignoreAcl: true });
    assert.strictEqual(after.metadata.mimeType, 'text/plain', 'mimeType should be untouched by default');
    assert.strictEqual(after.metadata.resourceType, 'rdf', 'resourceType should flip based on the new extension alone');
  });

  it('leaves resourceType as rdf across an extension change when mimeType was explicitly set to an RDF type, even with the flag off', async () => {
    const OLD_PATH = '/recheck/b.jsonld.json';
    const NEW_PATH = '/recheck/b.txt';

    await caskFs.write({
      filePath: OLD_PATH,
      data: Buffer.from(JSON.stringify({ '@id': 'https://example.org/recheck/b', '@type': 'http://schema.org/Thing' })),
      mimeType: 'application/ld+json',
      requestor: TEST_USER,
      ignoreAcl: true
    });

    await caskFs.moveFile(
      { filePath: OLD_PATH, requestor: TEST_USER, ignoreAcl: true },
      { destPath: NEW_PATH }
    );

    const after = await caskFs.metadata({ filePath: NEW_PATH, requestor: TEST_USER, ignoreAcl: true });
    assert.strictEqual(after.metadata.mimeType, 'application/ld+json', 'manually-set mimeType must survive untouched');
    assert.strictEqual(after.metadata.resourceType, 'rdf', 'mimeType alone still marks this as rdf');
  });

  it('with --recheck-mime-type, updates mimeType from the new extension and purges stale triples when resourceType flips away from rdf', async () => {
    const OLD_PATH = '/recheck/c.jsonld.json';
    const NEW_PATH = '/recheck/c.txt';
    const SUBJECT_URI = 'https://example.org/recheck/c';

    caskFs.rdf.filterUris = new Set([SUBJECT_URI]);
    caskFs.rdf.filterUriMatches = [];

    await caskFs.write({
      filePath: OLD_PATH,
      data: Buffer.from(JSON.stringify({
        '@id': SUBJECT_URI,
        '@type': 'http://schema.org/Thing',
        // a quad whose predicate is rdf:type is skipped entirely from filter harvesting
        // (including its subject), so a non-type property is needed for the subject to
        // become filterable at all
        'http://schema.org/description': 'test'
      })),
      requestor: TEST_USER,
      ignoreAcl: true
    });

    const beforeFind = await caskFs.rdf.find({ subject: SUBJECT_URI });
    assert.strictEqual(beforeFind.totalCount, 1);

    await caskFs.moveFile(
      { filePath: OLD_PATH, requestor: TEST_USER, ignoreAcl: true },
      { destPath: NEW_PATH, recheckMimeType: true }
    );

    const after = await caskFs.metadata({ filePath: NEW_PATH, requestor: TEST_USER, ignoreAcl: true });
    assert.strictEqual(after.metadata.mimeType, 'text/plain', 'mimeType should be re-detected from the new extension');
    assert.strictEqual(after.metadata.resourceType, 'file', 'resourceType should flip away from rdf');

    const afterFind = await caskFs.rdf.find({ subject: SUBJECT_URI });
    assert.strictEqual(afterFind.totalCount, 0, 'stale content triples should be purged when resourceType flips away from rdf');
  });
});
