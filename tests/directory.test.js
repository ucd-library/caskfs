import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';

const TEST_USER = 'test-user';

describe('Directory Operations', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();

    // Seed a directory tree used across multiple test groups:
    //
    //  /animals/
    //    cat.txt
    //    dog.txt
    //  /animals/big-cats/
    //    lion.txt
    //    tiger.txt
    //  /animals/canines/
    //    wolf.txt
    //  /plants/
    //    rose.txt

    const files = [
      { filePath: '/animals/cat.txt',           data: 'meow' },
      { filePath: '/animals/dog.txt',           data: 'woof' },
      { filePath: '/animals/big-cats/lion.txt', data: 'roar' },
      { filePath: '/animals/big-cats/tiger.txt',data: 'growl' },
      { filePath: '/animals/canines/wolf.txt',  data: 'howl' },
      { filePath: '/plants/rose.txt',           data: 'bloom' },
    ];

    for (const f of files) {
      await caskFs.write({
        filePath: f.filePath,
        data: Buffer.from(f.data),
        requestor: TEST_USER,
        ignoreAcl: true,
      });
    }
  });

  after(async () => {
    await teardown();
  });

  // ── Auto directory creation on write ──────────────────────────────────────

  describe('automatic directory creation on write()', () => {
    it('should create a single-level directory when writing a new file', async () => {
      await caskFs.write({
        filePath: '/auto-dir/file.txt',
        data: Buffer.from('hello'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const dir = await caskFs.dbClient.getDirectory('/auto-dir');
      assert.ok(dir, '/auto-dir should exist in the database');
      assert.strictEqual(dir.fullname, '/auto-dir');
    });

    it('should create all intermediate directories for a deep path', async () => {
      await caskFs.write({
        filePath: '/a/b/c/deep.txt',
        data: Buffer.from('deep'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      for (const dir of ['/a', '/a/b', '/a/b/c']) {
        const row = await caskFs.dbClient.getDirectory(dir);
        assert.ok(row, `${dir} should have been auto-created`);
      }
    });

    it('should set parent_id correctly for each level of the auto-created path', async () => {
      await caskFs.write({
        filePath: '/x/y/z/file.txt',
        data: Buffer.from('nested'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const root = await caskFs.dbClient.getDirectory('/');
      const x    = await caskFs.dbClient.getDirectory('/x');
      const xy   = await caskFs.dbClient.getDirectory('/x/y');
      const xyz  = await caskFs.dbClient.getDirectory('/x/y/z');

      assert.strictEqual(x.parent_id,   root.directory_id, '/x parent should be /');
      assert.strictEqual(xy.parent_id,  x.directory_id,    '/x/y parent should be /x');
      assert.strictEqual(xyz.parent_id, xy.directory_id,   '/x/y/z parent should be /x/y');
    });

    it('should set the root directory record with fullname="/"', async () => {
      const root = await caskFs.dbClient.getDirectory('/');
      assert.strictEqual(root.fullname, '/');
      assert.ok(root.directory_id, 'root should have a directory_id');
      assert.strictEqual(root.parent_id, null, 'root parent_id should be null');
    });

    it('should make auto-created directories visible via ls()', async () => {
      await caskFs.write({
        filePath: '/ls-auto/child/file.txt',
        data: Buffer.from('visible'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const result = await caskFs.ls({
        directory: '/ls-auto',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const dirNames = result.directories.map(d => d.fullname);
      assert.ok(dirNames.includes('/ls-auto/child'), 'auto-created sub-dir should appear in ls');
    });
  });

  // ── directory.mkdir() ──────────────────────────────────────────────────────

  describe('directory.mkdir()', () => {
    it('should return the directory_id for an already-existing directory', async () => {
      const id = await caskFs.directory.mkdir('/animals', {
        dbClient: caskFs.dbClient,
      });
      assert.ok(id, 'should return a directory_id');
    });

    it('should create intermediate directories and return the leaf id', async () => {
      const id = await caskFs.directory.mkdir('/new/nested/dir', {
        dbClient: caskFs.dbClient,
      });
      assert.ok(id, 'should return a directory_id for the leaf');

      // verify each level exists in the DB
      for (const dir of ['/new', '/new/nested', '/new/nested/dir']) {
        const row = await caskFs.dbClient.getDirectory(dir);
        assert.ok(row, `${dir} should exist in the database`);
      }
    });

    it('should be idempotent — calling mkdir twice returns the same id', async () => {
      const id1 = await caskFs.directory.mkdir('/idempotent-dir', { dbClient: caskFs.dbClient });
      const id2 = await caskFs.directory.mkdir('/idempotent-dir', { dbClient: caskFs.dbClient });
      assert.strictEqual(id1, id2);
    });
  });

  // ── directory.get() ────────────────────────────────────────────────────────

  describe('directory.get()', () => {
    it('should return the root directory', async () => {
      const dir = await caskFs.dbClient.getDirectory('/');
      assert.ok(dir, 'root directory should exist');
      assert.strictEqual(dir.fullname, '/');
    });

    it('should return an existing directory', async () => {
      const dir = await caskFs.dbClient.getDirectory('/animals');
      assert.ok(dir, '/animals should exist');
      assert.strictEqual(dir.fullname, '/animals');
    });

    it('should throw MissingResourceError for a non-existent directory', async () => {
      await assert.rejects(
        () => caskFs.dbClient.getDirectory('/does/not/exist'),
        { name: 'MissingResource' }
      );
    });
  });

  // ── ls() ───────────────────────────────────────────────────────────────────

  describe('ls()', () => {
    it('should list files directly inside /animals', async () => {
      const result = await caskFs.ls({
        directory: '/animals',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const fileNames = result.files.map(f => f.filename);
      assert.ok(fileNames.includes('cat.txt'), 'should include cat.txt');
      assert.ok(fileNames.includes('dog.txt'), 'should include dog.txt');
    });

    it('should list child directories of /animals', async () => {
      const result = await caskFs.ls({
        directory: '/animals',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const dirNames = result.directories.map(d => d.fullname);
      assert.ok(dirNames.includes('/animals/big-cats'), 'should include /animals/big-cats');
      assert.ok(dirNames.includes('/animals/canines'),  'should include /animals/canines');
    });

    it('should return files and dirs for a sub-directory', async () => {
      const result = await caskFs.ls({
        directory: '/animals/big-cats',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.strictEqual(result.directories.length, 0, 'big-cats has no sub-dirs');
      const fileNames = result.files.map(f => f.filename);
      assert.ok(fileNames.includes('lion.txt'));
      assert.ok(fileNames.includes('tiger.txt'));
    });

    it('should return an empty listing for a directory with no contents', async () => {
      await caskFs.directory.mkdir('/empty-dir', { dbClient: caskFs.dbClient });

      const result = await caskFs.ls({
        directory: '/empty-dir',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.strictEqual(result.files.length, 0);
      assert.strictEqual(result.directories.length, 0);
      assert.strictEqual(result.totalCount, 0);
    });

    it('should normalise a trailing slash on the directory path', async () => {
      const result = await caskFs.ls({
        directory: '/animals/',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(result.files.length > 0, 'should still return results with trailing slash');
    });

    it('should throw when directory is not provided', async () => {
      await assert.rejects(
        () => caskFs.ls({ requestor: TEST_USER, ignoreAcl: true }),
        /Directory is required/
      );
    });

    it('should reflect limit and offset in the returned metadata', async () => {
      const result = await caskFs.ls({
        directory: '/animals',
        limit: 1,
        offset: 0,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.strictEqual(result.limit, 1);
      assert.strictEqual(result.offset, 0);
      assert.ok(result.totalCount > 1, 'totalCount should exceed the page limit');
    });

    it('should advance results when offset is applied', async () => {
      const page1 = await caskFs.ls({
        directory: '/animals',
        limit: 100,
        offset: 0,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      const page2 = await caskFs.ls({
        directory: '/animals',
        limit: 100,
        offset: 1,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      // page2 should have one fewer directory than page1 (offset skips one dir)
      assert.ok(
        page2.directories.length < page1.directories.length ||
        page2.files.length < page1.files.length,
        'offset should reduce the number of returned results'
      );
    });

    it('should filter by query string', async () => {
      const result = await caskFs.ls({
        directory: '/animals',
        query: 'cat',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const names = [
        ...result.files.map(f => f.filename),
        ...result.directories.map(d => d.name),
      ];
      assert.ok(names.every(n => n.toLowerCase().includes('cat')),
        'all results should match the query string');
    });

    it('should include totalCount reflecting all matches', async () => {
      const result = await caskFs.ls({
        directory: '/animals',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.strictEqual(
        result.totalCount,
        result.files.length + result.directories.length
      );
    });
  });

  // ── deleteDirectory() ──────────────────────────────────────────────────────

  describe('deleteDirectory()', () => {
    it('should delete a leaf directory and its files', async () => {
      await caskFs.write({
        filePath: '/to-delete/file.txt',
        data: Buffer.from('bye'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      await caskFs.deleteDirectory({
        directory: '/to-delete',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const exists = await caskFs.exists({
        filePath: '/to-delete',
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.strictEqual(exists, false, '/to-delete should no longer exist');
    });

    it('should recursively delete sub-directories and their files', async () => {
      await caskFs.write({
        filePath: '/recursive-delete/sub/file.txt',
        data: Buffer.from('deep'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      await caskFs.deleteDirectory({
        directory: '/recursive-delete',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      await assert.rejects(
        () => caskFs.dbClient.getDirectory('/recursive-delete'),
        { name: 'MissingResource' }
      );
      await assert.rejects(
        () => caskFs.dbClient.getDirectory('/recursive-delete/sub'),
        { name: 'MissingResource' }
      );
    });

    it('should throw when trying to delete the root directory', async () => {
      await assert.rejects(
        () => caskFs.deleteDirectory({
          directory: '/',
          requestor: TEST_USER,
          ignoreAcl: true,
        }),
        /Cannot delete root directory/
      );
    });
  });
});
