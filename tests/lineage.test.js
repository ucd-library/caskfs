import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';
import aclImpl from '../src/lib/acl.js';

const TEST_USER = 'test-user';

/**
 * @function write
 * @description Convenience wrapper for writing a buffer to CaskFS with ACL bypassed.
 * @param {Object} caskFs
 * @param {String} filePath
 * @param {Object} [opts={}]
 * @returns {Promise<Object>} write context
 */
async function write(caskFs, filePath, opts={}) {
  return caskFs.write({
    filePath,
    data: opts.data || Buffer.from(`content of ${filePath}`),
    requestor: TEST_USER,
    ignoreAcl: true,
    ...opts
  });
}

describe('Lineage', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    await write(caskFs, '/bronze/raw.csv');
    await write(caskFs, '/silver/report.parquet');
    await write(caskFs, '/silver/other.parquet');
  });

  after(async () => {
    await teardown();
  });

  it('should add a derivative link with the default relation', async () => {
    const link = await caskFs.addDerivativeLink(
      { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/raw.csv' }
    );
    assert.strictEqual(link.relation, 'http://schema.org/source');
    assert.strictEqual(link.metadata, '');
  });

  it('getSources() should return the source file for the derivative', async () => {
    const sources = await caskFs.getSources(
      { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true }
    );
    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0].to_filepath, '/bronze/raw.csv');
    assert.strictEqual(sources[0].from_filepath, '/silver/report.parquet');
  });

  it('getDerivatives() should return the derivative for the source file', async () => {
    const derivatives = await caskFs.getDerivatives(
      { filePath: '/bronze/raw.csv', requestor: TEST_USER, ignoreAcl: true }
    );
    assert.strictEqual(derivatives.length, 1);
    assert.strictEqual(derivatives[0].from_filepath, '/silver/report.parquet');
  });

  it('should upsert metadata on a repeat add for the same (from, to, relation)', async () => {
    await caskFs.addDerivativeLink(
      { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/raw.csv', metadata: 'job-run-42' }
    );
    const sources = await caskFs.getSources(
      { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true }
    );
    assert.strictEqual(sources.length, 1, 'should still be a single link, not a duplicate');
    assert.strictEqual(sources[0].metadata, 'job-run-42');
  });

  it('should support a custom relation as a distinct link', async () => {
    await caskFs.addDerivativeLink(
      { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/raw.csv', relation: 'http://example.org/generatedFrom' }
    );
    const sources = await caskFs.getSources(
      { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true }
    );
    assert.strictEqual(sources.length, 2, 'default-relation and custom-relation links should coexist');
  });

  it('should reject a self-link', async () => {
    await assert.rejects(
      () => caskFs.addDerivativeLink(
        { filePath: '/silver/report.parquet', requestor: TEST_USER, ignoreAcl: true },
        { sourcePath: '/silver/report.parquet' }
      )
    );
  });

  it('should remove a derivative link', async () => {
    await caskFs.addDerivativeLink(
      { filePath: '/silver/other.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/raw.csv' }
    );
    await caskFs.removeDerivativeLink(
      { filePath: '/silver/other.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/raw.csv' }
    );
    const sources = await caskFs.getSources(
      { filePath: '/silver/other.parquet', requestor: TEST_USER, ignoreAcl: true }
    );
    assert.strictEqual(sources.length, 0);
  });

  // ── survives mv ──────────────────────────────────────────────────────────

  describe('survives file moves', () => {
    before(async () => {
      await write(caskFs, '/bronze/moveable.csv');
      await write(caskFs, '/silver/moveable-derived.parquet');
      await caskFs.addDerivativeLink(
        { filePath: '/silver/moveable-derived.parquet', requestor: TEST_USER, ignoreAcl: true },
        { sourcePath: '/bronze/moveable.csv' }
      );
    });

    it('should resolve to the new path after the source file is moved', async () => {
      await caskFs.moveFile(
        { filePath: '/bronze/moveable.csv', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/bronze/2024/moveable.csv' }
      );

      const sources = await caskFs.getSources(
        { filePath: '/silver/moveable-derived.parquet', requestor: TEST_USER, ignoreAcl: true }
      );
      assert.strictEqual(sources.length, 1);
      assert.strictEqual(sources[0].to_filepath, '/bronze/2024/moveable.csv', 'link should resolve to the new source path');
    });

    it('should resolve to the new path after the derivative file is moved', async () => {
      await caskFs.moveFile(
        { filePath: '/silver/moveable-derived.parquet', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/silver/2024/moveable-derived.parquet' }
      );

      const derivatives = await caskFs.getDerivatives(
        { filePath: '/bronze/2024/moveable.csv', requestor: TEST_USER, ignoreAcl: true }
      );
      assert.strictEqual(derivatives.length, 1);
      assert.strictEqual(derivatives[0].from_filepath, '/silver/2024/moveable-derived.parquet', 'link should resolve to the new derivative path');
    });
  });
});

// ── cascading delete ─────────────────────────────────────────────────────────

describe('Lineage — cascading delete', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  it('deleteFile without deleteLineage leaves derivative files untouched', async () => {
    await write(caskFs, '/bronze/a.csv');
    await write(caskFs, '/silver/a.parquet');
    await caskFs.addDerivativeLink(
      { filePath: '/silver/a.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/a.csv' }
    );

    await caskFs.deleteFile({ filePath: '/bronze/a.csv', requestor: TEST_USER, ignoreAcl: true });

    const meta = await caskFs.metadata({ filePath: '/silver/a.parquet', requestor: TEST_USER, ignoreAcl: true });
    assert.ok(meta, 'derivative file should still exist');
  });

  it('deleteFile with deleteLineage recursively deletes downstream derivatives', async () => {
    await write(caskFs, '/bronze/b.csv');
    await write(caskFs, '/silver/b.parquet');
    await write(caskFs, '/gold/b-summary.parquet');
    await caskFs.addDerivativeLink(
      { filePath: '/silver/b.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/b.csv' }
    );
    await caskFs.addDerivativeLink(
      { filePath: '/gold/b-summary.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/silver/b.parquet' }
    );

    const result = await caskFs.deleteFile({
      filePath: '/bronze/b.csv', requestor: TEST_USER, ignoreAcl: true, deleteLineage: true
    });

    assert.deepStrictEqual(
      result.deletedLineageFiles.sort(),
      ['/silver/b.parquet', '/gold/b-summary.parquet'].sort()
    );

    await assert.rejects(
      () => caskFs.metadata({ filePath: '/silver/b.parquet', requestor: TEST_USER, ignoreAcl: true }),
      { name: 'MissingResource' }
    );
    await assert.rejects(
      () => caskFs.metadata({ filePath: '/gold/b-summary.parquet', requestor: TEST_USER, ignoreAcl: true }),
      { name: 'MissingResource' }
    );
  });

  it('deleteFile with deleteLineage only deletes each shared derivative once (diamond dependency)', async () => {
    await write(caskFs, '/bronze/c.csv');
    await write(caskFs, '/silver/c1.parquet');
    await write(caskFs, '/silver/c2.parquet');
    await write(caskFs, '/gold/c-joined.parquet');
    await caskFs.addDerivativeLink(
      { filePath: '/silver/c1.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/c.csv' }
    );
    await caskFs.addDerivativeLink(
      { filePath: '/silver/c2.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/c.csv' }
    );
    // gold file derived from both silver files
    await caskFs.addDerivativeLink(
      { filePath: '/gold/c-joined.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/silver/c1.parquet' }
    );
    await caskFs.addDerivativeLink(
      { filePath: '/gold/c-joined.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/silver/c2.parquet' }
    );

    const result = await caskFs.deleteFile({
      filePath: '/bronze/c.csv', requestor: TEST_USER, ignoreAcl: true, deleteLineage: true
    });

    assert.strictEqual(result.deletedLineageFiles.length, 3, 'gold file should only be deleted once despite two paths to it');
  });

  it('deleteDirectory with deleteLineage cascades derivatives that live outside the deleted directory', async () => {
    await write(caskFs, '/bronze/dir-src.csv');
    await write(caskFs, '/silver/dir-derived.parquet');
    await caskFs.addDerivativeLink(
      { filePath: '/silver/dir-derived.parquet', requestor: TEST_USER, ignoreAcl: true },
      { sourcePath: '/bronze/dir-src.csv' }
    );

    await caskFs.deleteDirectory({ directory: '/bronze', requestor: TEST_USER, ignoreAcl: true, deleteLineage: true });

    await assert.rejects(
      () => caskFs.metadata({ filePath: '/silver/dir-derived.parquet', requestor: TEST_USER, ignoreAcl: true }),
      { name: 'MissingResource' }
    );
  });
});

// ── permissions ─────────────────────────────────────────────────────────────

describe('Lineage — permissions', () => {
  let caskFs;

  before(async () => {
    aclImpl.enabled = true;
    caskFs = await setup();
    await write(caskFs, '/locked-from/derived.txt');
    await write(caskFs, '/locked-to/source.txt');
  });

  after(async () => {
    aclImpl.enabled = false;
    await teardown();
  });

  it('should throw AclAccessError when the requestor has no write permission on the from-file', async () => {
    await assert.rejects(
      () => caskFs.addDerivativeLink(
        { filePath: '/locked-from/derived.txt', requestor: 'alice' },
        { sourcePath: '/locked-to/source.txt' }
      ),
      { name: 'AclAccessError' }
    );
  });
});
