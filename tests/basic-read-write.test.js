import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';

const LD_FILE_PATH = '/ld-test/sample.jsonld.json';
const LD_SUBJECT = 'https://example.org/test/sample';
const LD_DATA = JSON.stringify({
  '@id': LD_SUBJECT,
  '@type': 'http://schema.org/Thing',
  'http://schema.org/name': 'Sample LD'
});

const TEST_FILE_PATH = '/test-dir/hello.txt';
const TEST_CONTENT = 'Hello, CaskFS!';
const UPDATED_CONTENT = 'Updated content!';
const TEST_USER = 'test-user';

describe('Basic Read/Write Operations', () => {
  let caskFs;

  before(async () => {
    caskFs = await setup();
  });

  after(async () => {
    await teardown();
  });

  describe('write()', () => {
    it('should write a file from a Buffer', async () => {
      const ctx = await caskFs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(!ctx.data.error, `write should not error: ${ctx.data.error?.message}`);
      assert.strictEqual(ctx.data.actions.fileInsert, true, 'should have inserted a new file record');
      assert.ok(ctx.data.file?.file_id, 'should return a file_id');
    });

    it('should return DuplicateFileError when writing to an existing path without replace', async () => {
      const ctx = await caskFs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from('different content'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.ok(ctx.data.error, 'should have an error in the context');
      assert.strictEqual(ctx.data.error.name, 'DuplicateFileError');
    });

    it('should replace a file when replace=true', async () => {
      const ctx = await caskFs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(UPDATED_CONTENT),
        replace: true,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(!ctx.data.error, `replace should not error: ${ctx.data.error?.message}`);
      assert.strictEqual(ctx.data.actions.replacedFile, true, 'should report file was replaced');
    });
  });

  describe('read()', () => {
    it('should read back the current file contents', async () => {
      const buffer = await caskFs.read({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(Buffer.isBuffer(buffer), 'should return a Buffer');
      assert.strictEqual(buffer.toString(), UPDATED_CONTENT);
    });

    it('should read with utf8 encoding option', async () => {
      const content = await caskFs.read(
        { filePath: TEST_FILE_PATH, requestor: TEST_USER, ignoreAcl: true },
        { encoding: 'utf8' }
      );

      assert.strictEqual(typeof content, 'string');
      assert.strictEqual(content, UPDATED_CONTENT);
    });

    it('should throw MissingResourceError for a non-existent file', async () => {
      await assert.rejects(
        () => caskFs.read({ filePath: '/does/not/exist.txt', requestor: TEST_USER, ignoreAcl: true }),
        { name: 'MissingResource' }
      );
    });
  });

  describe('exists()', () => {
    it('should return true for an existing file', async () => {
      const result = await caskFs.exists({
        filePath: TEST_FILE_PATH,
        file: true,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.strictEqual(result, true);
    });

    it('should return false for a non-existent file', async () => {
      const result = await caskFs.exists({
        filePath: '/no/such/file.txt',
        file: true,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.strictEqual(result, false);
    });

    it('should return true for an existing directory path', async () => {
      const result = await caskFs.exists({
        filePath: '/test-dir',
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.strictEqual(result, true);
    });
  });

  describe('metadata()', () => {
    it('should return metadata for a written file', async () => {
      const meta = await caskFs.metadata({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      assert.ok(meta, 'should return a metadata object');
      assert.ok(meta.file_id, 'should have a file_id');
      assert.ok(meta.hash_value, 'should have a hash_value');
      assert.strictEqual(meta.filename, 'hello.txt');
      assert.strictEqual(meta.directory, '/test-dir');
    });

    it('should throw MissingResourceError for a non-existent file', async () => {
      await assert.rejects(
        () => caskFs.metadata({ filePath: '/no/such/file.txt', requestor: TEST_USER, ignoreAcl: true }),
        { name: 'MissingResource' }
      );
    });
  });

  describe('deleteFile()', () => {
    it('should delete an existing file', async () => {
      await caskFs.deleteFile({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const exists = await caskFs.exists({
        filePath: TEST_FILE_PATH,
        file: true,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.strictEqual(exists, false, 'file should no longer exist after deletion');
    });

    it('should throw MissingResourceError when deleting a non-existent file', async () => {
      await assert.rejects(
        () => caskFs.deleteFile({ filePath: TEST_FILE_PATH, requestor: TEST_USER, ignoreAcl: true }),
        { name: 'MissingResource' }
      );
    });
  });

  describe('LD file .nq companion files', () => {
    let ldHash;

    it('should create a .nq file on disk when writing a JSON-LD file', async () => {
      const ctx = await caskFs.write({
        filePath: LD_FILE_PATH,
        data: Buffer.from(LD_DATA),
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.ok(!ctx.data.error, `write should not error: ${ctx.data.error?.message}`);
      assert.ok(ctx.data.actions.detectedLd, 'file should be detected as linked data');
      ldHash = ctx.data.file?.hash_value;
      assert.ok(ldHash, 'should have a hash_value');

      const exists = await caskFs.cas.quadExists(ldHash);
      assert.ok(exists, '.nq file should exist on disk after writing a JSON-LD file');
    });

    it('.nq file should contain the subject URI', async () => {
      const nquads = await caskFs.cas.readQuads(ldHash);
      assert.ok(typeof nquads === 'string', '.nq content should be a string');
      assert.ok(nquads.length > 0, '.nq file should not be empty');
      assert.ok(nquads.includes(LD_SUBJECT), '.nq file should contain the subject URI');
    });

    it('should not create a .nq file when writing a non-LD file', async () => {
      const ctx = await caskFs.write({
        filePath: '/ld-test/plain.txt',
        data: Buffer.from('plain text, not linked data'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      assert.ok(!ctx.data.error);
      const hash = ctx.data.file?.hash_value;
      const exists = await caskFs.cas.quadExists(hash);
      assert.strictEqual(exists, false, '.nq file should not exist for a non-LD file');
    });

    it('should remove the .nq file when the hash is hard-deleted', async () => {
      await caskFs.deleteFile({ filePath: LD_FILE_PATH, requestor: TEST_USER, ignoreAcl: true });
      await caskFs.cas.delete(ldHash);

      const exists = await caskFs.cas.quadExists(ldHash);
      assert.strictEqual(exists, false, '.nq file should be removed when the hash is deleted');
    });
  });
});
