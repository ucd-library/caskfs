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

// ── moveFile() ──────────────────────────────────────────────────────────────

describe('moveFile()', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  it('should rename a file in place, keeping the same file_id', async () => {
    await write(caskFs, '/mv/a.txt');
    const before = await meta(caskFs, '/mv/a.txt');

    await caskFs.moveFile(
      { filePath: '/mv/a.txt', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/mv/a-renamed.txt' }
    );

    assert.ok(!await fileExists(caskFs, '/mv/a.txt'), 'old path should be gone');
    const after = await meta(caskFs, '/mv/a-renamed.txt');
    assert.strictEqual(after.file_id, before.file_id, 'file_id should be unchanged');
    assert.strictEqual(after.hash_value, before.hash_value, 'hash should be unchanged');
  });

  it('should move a file into a not-yet-existing directory, auto-creating it', async () => {
    await write(caskFs, '/mv/b.txt');
    await caskFs.moveFile(
      { filePath: '/mv/b.txt', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/mv/deep/nested/b.txt' }
    );
    assert.ok(!await fileExists(caskFs, '/mv/b.txt'));
    assert.ok(await fileExists(caskFs, '/mv/deep/nested/b.txt'));
  });

  it('should throw when destPath already exists', async () => {
    await write(caskFs, '/mv/c1.txt');
    await write(caskFs, '/mv/c2.txt');
    await assert.rejects(
      () => caskFs.moveFile(
        { filePath: '/mv/c1.txt', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/mv/c2.txt' }
      ),
      { name: 'DuplicateFileError' }
    );
  });

  it('should throw when destPath equals the source path', async () => {
    await write(caskFs, '/mv/same.txt');
    await assert.rejects(
      () => caskFs.moveFile(
        { filePath: '/mv/same.txt', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/mv/same.txt' }
      )
    );
  });
});

// ── moveDirectory() ──────────────────────────────────────────────────────────

describe('moveDirectory()', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    await write(caskFs, '/mvd/src/a.txt');
    await write(caskFs, '/mvd/src/sub/b.txt');
  });

  after(async () => {
    await teardown();
  });

  let idsBefore = {};

  it('should move a directory and all descendants, preserving ids', async () => {
    idsBefore.a = (await meta(caskFs, '/mvd/src/a.txt')).file_id;
    idsBefore.b = (await meta(caskFs, '/mvd/src/sub/b.txt')).file_id;
    const dirBefore = await caskFs.dbClient.getDirectory('/mvd/src');

    await caskFs.moveDirectory(
      { directory: '/mvd/src', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/mvd/dest' }
    );

    assert.ok(!await fileExists(caskFs, '/mvd/src/a.txt'), 'old path should be gone');
    assert.ok(await fileExists(caskFs, '/mvd/dest/a.txt'), 'file should exist at new path');
    assert.ok(await fileExists(caskFs, '/mvd/dest/sub/b.txt'), 'nested file should exist at new path');

    const aAfter = await meta(caskFs, '/mvd/dest/a.txt');
    const bAfter = await meta(caskFs, '/mvd/dest/sub/b.txt');
    assert.strictEqual(aAfter.file_id, idsBefore.a, 'a.txt file_id should be unchanged');
    assert.strictEqual(bAfter.file_id, idsBefore.b, 'b.txt file_id should be unchanged');

    const dirAfter = await caskFs.dbClient.getDirectory('/mvd/dest');
    assert.strictEqual(dirAfter.directory_id, dirBefore.directory_id, 'directory_id should be unchanged');
  });

  it('should throw when moving the root directory', async () => {
    await assert.rejects(
      () => caskFs.moveDirectory(
        { directory: '/', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/somewhere' }
      )
    );
  });

  it('should throw when moving a directory into its own descendant', async () => {
    await write(caskFs, '/mvd/parent/child/leaf.txt');
    await assert.rejects(
      () => caskFs.moveDirectory(
        { directory: '/mvd/parent', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/mvd/parent/child/nested' }
      )
    );
  });

  it('should throw when destPath already exists', async () => {
    await write(caskFs, '/mvd/existing/file.txt');
    await write(caskFs, '/mvd/other/file.txt');
    await assert.rejects(
      () => caskFs.moveDirectory(
        { directory: '/mvd/other', requestor: TEST_USER, ignoreAcl: true },
        { destPath: '/mvd/existing' }
      )
    );
  });
});

// ── move() — auto-detect ─────────────────────────────────────────────────────

describe('move() — auto-detect', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
    await write(caskFs, '/ad/file.txt');
    await write(caskFs, '/ad/dir/nested.txt');
  });

  after(async () => {
    await teardown();
  });

  it('should detect a file and move it', async () => {
    await caskFs.move(
      { filePath: '/ad/file.txt', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/ad/file-moved.txt' }
    );
    assert.ok(await fileExists(caskFs, '/ad/file-moved.txt'));
    assert.ok(!await fileExists(caskFs, '/ad/file.txt'));
  });

  it('should detect a directory and move it', async () => {
    await caskFs.move(
      { filePath: '/ad/dir', requestor: TEST_USER, ignoreAcl: true },
      { destPath: '/ad/dir-moved' }
    );
    assert.ok(await fileExists(caskFs, '/ad/dir-moved/nested.txt'));
    assert.ok(!await fileExists(caskFs, '/ad/dir/nested.txt'));
  });
});

// ── move() — permissions ─────────────────────────────────────────────────────

describe('move() — permissions', () => {
  let caskFs;

  before(async () => {
    aclImpl.enabled = true;
    caskFs = await setup();
    await write(caskFs, '/locked/file.txt');
  });

  after(async () => {
    aclImpl.enabled = false;
    await teardown();
  });

  it('should throw AclAccessError when the requestor has no write permission', async () => {
    await assert.rejects(
      () => caskFs.move(
        { filePath: '/locked/file.txt', requestor: 'alice' },
        { destPath: '/locked/renamed.txt' }
      ),
      { name: 'AclAccessError' }
    );
  });
});
