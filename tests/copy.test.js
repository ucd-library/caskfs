import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';

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

/**
 * @function meta
 * @description Retrieve metadata for a CaskFS file with ACL bypassed.
 * @param {Object} caskFs
 * @param {String} filePath
 * @returns {Promise<Object>}
 */
async function meta(caskFs, filePath) {
  return caskFs.metadata({ filePath, requestor: TEST_USER, ignoreAcl: true });
}

/**
 * @function fileExists
 * @description Return true if the file exists in CaskFS.
 * @param {Object} caskFs
 * @param {String} filePath
 * @returns {Promise<Boolean>}
 */
async function fileExists(caskFs, filePath) {
  try {
    await meta(caskFs, filePath);
    return true;
  } catch(e) {
    return false;
  }
}

// ── copyFile() ────────────────────────────────────────────────────────────────

describe('copyFile()', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    // Write the source file used across most tests in this suite
    await write(caskFs, '/cf/src.pdf', {
      mimeType: 'application/pdf',
      metadata: { author: 'alice', project: 'alpha' },
      partitionKeys: ['pk-one', 'pk-two']
    });
  });

  after(async () => {
    await teardown();
  });

  it('should copy a file to a new path', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest.pdf' }
    );
    assert.ok(await fileExists(caskFs, '/cf/dest.pdf'), 'destination file should exist');
  });

  it('destination should share the same hash value (CAS not duplicated)', async () => {
    const src  = await meta(caskFs, '/cf/src.pdf');
    const dest = await meta(caskFs, '/cf/dest.pdf');
    assert.strictEqual(dest.hash_value, src.hash_value, 'hash values should match');
  });

  it('should always copy mimeType from source', async () => {
    // dest path has a .txt extension — mimeType should still be pdf from source
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-mime.txt' }
    );
    const dest = await meta(caskFs, '/cf/dest-mime.txt');
    assert.strictEqual(dest.metadata?.mimeType, 'application/pdf', 'mimeType should come from source not dest extension');
  });

  it('should NOT copy metadata when copyMetadata is false (default)', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-no-meta.pdf' }
    );
    const dest = await meta(caskFs, '/cf/dest-no-meta.pdf');
    assert.strictEqual(dest.metadata?.author, undefined, 'author should not be copied');
    assert.strictEqual(dest.metadata?.project, undefined, 'project should not be copied');
  });

  it('should copy metadata when copyMetadata=true', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-with-meta.pdf', copyMetadata: true }
    );
    const dest = await meta(caskFs, '/cf/dest-with-meta.pdf');
    assert.strictEqual(dest.metadata?.author, 'alice');
    assert.strictEqual(dest.metadata?.project, 'alpha');
  });

  it('opts.metadata should override specific keys when copyMetadata=true', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-meta-override.pdf', copyMetadata: true, metadata: { project: 'beta' } }
    );
    const dest = await meta(caskFs, '/cf/dest-meta-override.pdf');
    assert.strictEqual(dest.metadata?.author, 'alice', 'un-overridden key should be copied');
    assert.strictEqual(dest.metadata?.project, 'beta', 'overridden key should use opts.metadata value');
  });

  it('should NOT copy partition keys when copyPartitions is false (default)', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-no-pk.pdf' }
    );
    const dest = await meta(caskFs, '/cf/dest-no-pk.pdf');
    assert.deepStrictEqual(dest.partition_keys, [], 'partition keys should not be copied');
  });

  it('should copy partition keys when copyPartitions=true', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-with-pk.pdf', copyPartitions: true }
    );
    const dest = await meta(caskFs, '/cf/dest-with-pk.pdf');
    assert.ok(dest.partition_keys?.includes('pk-one'), 'pk-one should be copied');
    assert.ok(dest.partition_keys?.includes('pk-two'), 'pk-two should be copied');
  });

  it('opts.partitionKeys should be used instead of source keys', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest-custom-pk.pdf', partitionKeys: ['custom-key'] }
    );
    const dest = await meta(caskFs, '/cf/dest-custom-pk.pdf');
    assert.ok(dest.partition_keys?.includes('custom-key'), 'custom key should be set');
    assert.ok(!dest.partition_keys?.includes('pk-one'), 'source keys should not be present');
  });

  it('should throw DuplicateFileError when dest exists and replace=false', async () => {
    await assert.rejects(
      () => caskFs.copyFile(
        { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/cf/dest.pdf', replace: false }
      ),
      { name: 'DuplicateFileError' }
    );
  });

  it('should succeed when dest exists and replace=true', async () => {
    await caskFs.copyFile(
      { filePath: '/cf/src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/dest.pdf', replace: true }
    );
    assert.ok(await fileExists(caskFs, '/cf/dest.pdf'), 'dest should still exist after replace');
  });

  it('move=true should delete the source file after copy', async () => {
    await write(caskFs, '/cf/move-src.pdf');
    await caskFs.copyFile(
      { filePath: '/cf/move-src.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/cf/move-dest.pdf', move: true }
    );
    assert.ok(await fileExists(caskFs, '/cf/move-dest.pdf'), 'destination should exist');
    assert.ok(!await fileExists(caskFs, '/cf/move-src.pdf'), 'source should be deleted');
  });

  it('move=true should leave the hash file intact (dest still references it)', async () => {
    // hash_value on dest should be valid — CAS file was not removed
    const dest = await meta(caskFs, '/cf/move-dest.pdf');
    assert.ok(dest.hash_value, 'dest should have a hash_value after move');
    assert.ok(caskFs.cas.exists(dest.hash_value), 'CAS file should still exist on disk');
  });
});

// ── copy() — auto-detect ──────────────────────────────────────────────────────

describe('copy() — single file (auto-detect)', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    await write(caskFs, '/ac/file.pdf', {
      mimeType: 'application/pdf',
      metadata: { tag: 'original' }
    });
  });

  after(async () => {
    await teardown();
  });

  it('should detect a file and copy it to the destination', async () => {
    await caskFs.copy(
      { filePath: '/ac/file.pdf', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/ac/file-copy.pdf' }
    );
    assert.ok(await fileExists(caskFs, '/ac/file-copy.pdf'), 'destination should exist');
  });

  it('should share the same hash value as the source', async () => {
    const src  = await meta(caskFs, '/ac/file.pdf');
    const dest = await meta(caskFs, '/ac/file-copy.pdf');
    assert.strictEqual(dest.hash_value, src.hash_value);
  });
});

// ── copy() — directory ────────────────────────────────────────────────────────

describe('copy() — directory (recursive)', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    // flat files
    await write(caskFs, '/dc/a.txt');
    await write(caskFs, '/dc/b.txt');
    // sub-directory
    await write(caskFs, '/dc/sub/c.txt');
    await write(caskFs, '/dc/sub/d.txt');
    // deeper nesting
    await write(caskFs, '/dc/sub/deep/e.txt');
  });

  after(async () => {
    await teardown();
  });

  it('should copy all files in a directory to the destination', async () => {
    const result = await caskFs.copy(
      { filePath: '/dc', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/dc-dest' }
    );
    assert.strictEqual(result.errors.length, 0, `unexpected errors: ${JSON.stringify(result.errors)}`);
    assert.ok(await fileExists(caskFs, '/dc-dest/a.txt'));
    assert.ok(await fileExists(caskFs, '/dc-dest/b.txt'));
  });

  it('should recurse into subdirectories', async () => {
    assert.ok(await fileExists(caskFs, '/dc-dest/sub/c.txt'));
    assert.ok(await fileExists(caskFs, '/dc-dest/sub/d.txt'));
    assert.ok(await fileExists(caskFs, '/dc-dest/sub/deep/e.txt'));
  });

  it('should report the correct number of copied files', async () => {
    const result = await caskFs.copy(
      { filePath: '/dc', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/dc-dest2' }
    );
    assert.strictEqual(result.copied, 5);
  });

  it('move=true should delete all source files', async () => {
    // set up a separate source tree for the move test
    await write(caskFs, '/dc-move/x.txt');
    await write(caskFs, '/dc-move/y.txt');

    const result = await caskFs.copy(
      { filePath: '/dc-move', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/dc-move-dest', move: true }
    );

    assert.strictEqual(result.errors.length, 0);
    assert.ok(await fileExists(caskFs, '/dc-move-dest/x.txt'), 'dest x.txt should exist');
    assert.ok(await fileExists(caskFs, '/dc-move-dest/y.txt'), 'dest y.txt should exist');
    assert.ok(!await fileExists(caskFs, '/dc-move/x.txt'), 'src x.txt should be deleted');
    assert.ok(!await fileExists(caskFs, '/dc-move/y.txt'), 'src y.txt should be deleted');
  });
});
