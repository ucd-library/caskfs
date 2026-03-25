import assert from 'assert';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { setup, teardown } from './helpers/setup.js';

const TEST_USER = 'test-user';

// Helper: compute sha256 of a buffer
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Helper: create a simple mock context for stageWrite
function makeContext(dataOpts) {
  const ctx = {
    data: dataOpts,
    logSignal: null,
    stagedFile: null,
    update(obj) {
      Object.assign(this, obj);
    }
  };
  return ctx;
}

describe('CAS Layer', () => {
  let caskFs;
  let cas;

  before(async () => {
    caskFs = await setup();
    cas = caskFs.cas;
  });

  after(async () => {
    await teardown();
  });

  // ── Pure utility functions ─────────────────────────────────────────────────

  describe('_getHashFilePath()', () => {
    it('should split the hash into a 3-level directory path', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const result = cas._getHashFilePath(hash);
      assert.strictEqual(result, `abc/def/${hash}`);
    });

    it('should use the first 6 hex chars for two directory levels', () => {
      const hash = '0011223344556677889900112233445566778899001122334455667788990011';
      const result = cas._getHashFilePath(hash);
      assert.ok(result.startsWith('001/122/'), `expected path to start with 001/122/ but got ${result}`);
      assert.ok(result.endsWith(hash));
    });
  });

  describe('_hashData()', () => {
    it('should return sha256 and md5 digests for a buffer', () => {
      const data = Buffer.from('hello world');
      const digests = cas._hashData(data);

      assert.ok(digests.sha256, 'should have sha256 digest');
      assert.ok(digests.md5, 'should have md5 digest');

      const expectedSha256 = crypto.createHash('sha256').update(data).digest('hex');
      const expectedMd5 = crypto.createHash('md5').update(data).digest('hex');

      assert.strictEqual(digests.sha256, expectedSha256);
      assert.strictEqual(digests.md5, expectedMd5);
    });

    it('should produce different digests for different data', () => {
      const d1 = cas._hashData(Buffer.from('foo'));
      const d2 = cas._hashData(Buffer.from('bar'));
      assert.notStrictEqual(d1.sha256, d2.sha256);
      assert.notStrictEqual(d1.md5, d2.md5);
    });
  });

  describe('diskPath()', () => {
    it('should return an absolute path rooted at config.rootDir/cas', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const result = cas.diskPath(hash);
      assert.ok(path.isAbsolute(result), 'diskPath should return an absolute path');
      assert.ok(result.includes('cas'), 'diskPath should include the cas sub-directory');
      assert.ok(result.endsWith(hash), 'diskPath should end with the hash value');
    });
  });

  // ── Filesystem write helpers ───────────────────────────────────────────────

  describe('writeData()', () => {
    it('should write buffer data to a temp file and return digests', async () => {
      const data = Buffer.from('writeData test content');
      const tmpDir = path.join(caskFs.rootDir, 'tmp');
      await fsp.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, 'test-write-data.bin');

      const digests = await cas.writeData(tmpFile, { data });

      assert.ok(fs.existsSync(tmpFile), 'temp file should exist after writeData');
      assert.ok(digests.sha256, 'should return sha256 digest');
      assert.ok(digests.md5, 'should return md5 digest');

      const expectedSha256 = sha256(data);
      assert.strictEqual(digests.sha256, expectedSha256, 'sha256 should match data content');

      await fsp.unlink(tmpFile);
    });
  });

  describe('writeStream()', () => {
    it('should write a readable stream to a file and return digests', async () => {
      const content = 'stream content for testing';
      const data = Buffer.from(content);
      const readable = Readable.from([data]);

      const tmpDir = path.join(caskFs.rootDir, 'tmp');
      await fsp.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, 'test-write-stream.bin');

      const digests = await cas.writeStream(tmpFile, readable);

      assert.ok(fs.existsSync(tmpFile), 'temp file should exist after writeStream');

      const expectedSha256 = sha256(data);
      assert.strictEqual(digests.sha256, expectedSha256);

      await fsp.unlink(tmpFile);
    });
  });

  describe('writePath()', () => {
    it('should copy a file from an absolute path and return digests', async () => {
      const content = Buffer.from('writePath test content');

      // create a source file
      const srcDir = path.join(caskFs.rootDir, 'tmp');
      await fsp.mkdir(srcDir, { recursive: true });
      const srcFile = path.join(srcDir, 'source.bin');
      await fsp.writeFile(srcFile, content);

      const tmpFile = path.join(srcDir, 'dest.bin');

      const digests = await cas.writePath(tmpFile, { readPath: srcFile });

      assert.ok(digests.sha256, 'should return sha256 digest');
      const expectedSha256 = sha256(content);
      assert.strictEqual(digests.sha256, expectedSha256);

      await fsp.unlink(srcFile);
      // tmpFile may or may not exist depending on whether hash already existed
    });

    it('should throw when readPath is not absolute', async () => {
      await assert.rejects(
        () => cas.writePath('/tmp/dest.bin', { readPath: 'relative/path.txt' }),
        /readPath must be an absolute path/
      );
    });

    it('should throw when readPath does not exist', async () => {
      await assert.rejects(
        () => cas.writePath('/tmp/dest.bin', { readPath: '/nonexistent/path/file.txt' }),
        /readPath does not exist/
      );
    });
  });

  // ── Stage / finalize / abort ───────────────────────────────────────────────

  describe('stageWrite() + finalizeWrite()', () => {
    it('should stage a write from buffer data and finalize it', async () => {
      const content = Buffer.from('stage and finalize test');
      const ctx = makeContext({ data: content });

      await cas.stageWrite(ctx);

      assert.ok(ctx.stagedFile, 'context should have stagedFile after stageWrite');
      assert.ok(ctx.stagedFile.hash_value, 'stagedFile should have a hash_value');
      assert.ok(ctx.stagedFile.tmpFile, 'stagedFile should have a tmpFile path');
      assert.ok(fs.existsSync(ctx.stagedFile.tmpFile), 'tmpFile should exist on disk');

      // finalize
      const copied = await cas.finalizeWrite(
        ctx.stagedFile.tmpFile,
        ctx.stagedFile.hashFile,
        null,
        {}
      );

      assert.strictEqual(copied, true, 'should report the file was copied');
      assert.ok(fs.existsSync(ctx.stagedFile.hashFile), 'hash file should exist after finalizeWrite');
      assert.ok(!fs.existsSync(ctx.stagedFile.tmpFile), 'tmpFile should be removed after finalizeWrite');
    });

    it('should not copy again when the hash file already exists', async () => {
      const content = Buffer.from('duplicate stage test');
      const ctx1 = makeContext({ data: content });
      await cas.stageWrite(ctx1);
      await cas.finalizeWrite(ctx1.stagedFile.tmpFile, ctx1.stagedFile.hashFile, null, {});

      // stage the same content again
      const ctx2 = makeContext({ data: content });
      await cas.stageWrite(ctx2);
      const copied = await cas.finalizeWrite(ctx2.stagedFile.tmpFile, ctx2.stagedFile.hashFile, null, {});

      assert.strictEqual(copied, false, 'should not copy when the hash already exists');
    });

    it('should stage a write from a readable stream', async () => {
      const content = Buffer.from('stage from stream content');
      const readable = Readable.from([content]);
      const ctx = makeContext({ readStream: readable });

      await cas.stageWrite(ctx);

      assert.ok(ctx.stagedFile, 'context should have stagedFile');
      assert.ok(ctx.stagedFile.hash_value, 'should have a hash_value');

      // cleanup
      await cas.abortWrite(ctx.stagedFile.tmpFile);
    });
  });

  describe('abortWrite()', () => {
    it('should delete the temp file', async () => {
      const content = Buffer.from('abort write test');
      const ctx = makeContext({ data: content });
      await cas.stageWrite(ctx);

      assert.ok(fs.existsSync(ctx.stagedFile.tmpFile), 'tmpFile should exist before abort');

      await cas.abortWrite(ctx.stagedFile.tmpFile);

      assert.ok(!fs.existsSync(ctx.stagedFile.tmpFile), 'tmpFile should not exist after abort');
    });

    it('should not throw when the temp file does not exist', async () => {
      await assert.doesNotReject(() => cas.abortWrite('/tmp/nonexistent-cas-file.bin'));
    });
  });

  // ── Read ───────────────────────────────────────────────────────────────────

  describe('read()', () => {
    let storedHash;
    const readContent = Buffer.from('read test content');

    before(async () => {
      // write a file through the high-level API so the CAS file exists
      const ctx = await caskFs.write({
        filePath: '/cas-test/read-test.bin',
        data: readContent,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      storedHash = ctx.data.file?.hash_value;
    });

    it('should return a Buffer by default', async () => {
      const result = await cas.read(storedHash);
      assert.ok(Buffer.isBuffer(result), 'should return a Buffer');
      assert.ok(result.equals(readContent), 'buffer content should match original');
    });

    it('should return a string when encoding is specified', async () => {
      const result = await cas.read(storedHash, { encoding: 'utf8' });
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result, readContent.toString('utf8'));
    });

    it('should return a readable stream when stream=true', async () => {
      const stream = await cas.read(storedHash, { stream: true });
      assert.ok(typeof stream.pipe === 'function', 'should return a readable stream');

      // consume stream and check content
      const chunks = [];
      await new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const result = Buffer.concat(chunks);
      assert.ok(result.equals(readContent));
    });

    it('should throw when the hash does not exist', async () => {
      const fakeHash = 'a'.repeat(64);
      await assert.rejects(
        () => cas.read(fakeHash),
        /does not exist/
      );
    });
  });

  // ── Exists ─────────────────────────────────────────────────────────────────

  describe('exists()', () => {
    let existingHash;

    before(async () => {
      const ctx = await caskFs.write({
        filePath: '/cas-test/exists-test.bin',
        data: Buffer.from('exists check content'),
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      existingHash = ctx.data.file?.hash_value;
    });

    it('should return true for a hash that exists on disk', () => {
      const result = cas.exists(existingHash);
      assert.strictEqual(result, true);
    });

    it('should return false for a hash that does not exist', () => {
      const result = cas.exists('b'.repeat(64));
      assert.strictEqual(result, false);
    });
  });

  // ── Location ───────────────────────────────────────────────────────────────

  describe('getLocation()', () => {
    it('should return "fs" when using the filesystem storage backend', async () => {
      const location = await cas.getLocation();
      assert.strictEqual(location, 'fs');
    });
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should hard-delete the file when no references remain', async () => {
      const content = Buffer.from('delete-me-hard');
      const writeCtx = await caskFs.write({
        filePath: '/cas-test/delete-hard.bin',
        data: content,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      const hash = writeCtx.data.file?.hash_value;
      assert.ok(hash, 'should have a hash from write');

      // remove the file reference first so CAS sees 0 references
      await caskFs.deleteFile({
        filePath: '/cas-test/delete-hard.bin',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const result = await cas.delete(hash);

      assert.strictEqual(result.fileDeleted, true, 'fileDeleted should be true');
      assert.strictEqual(result.referencesRemaining, 0);
      assert.ok(!cas.exists(hash), 'file should no longer exist on disk');
    });

    it('should perform a soft delete and not remove the file', async () => {
      const content = Buffer.from('soft-delete-test-' + Date.now());
      const writeCtx = await caskFs.write({
        filePath: '/cas-test/delete-soft.bin',
        data: content,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      const hash = writeCtx.data.file?.hash_value;

      const result = await cas.delete(hash, { softDelete: true });

      assert.strictEqual(result.softDelete, true);
      assert.strictEqual(result.fileDeleted, false);
      assert.ok(cas.exists(hash), 'file should still exist after soft delete');

      // cleanup
      await caskFs.deleteFile({
        filePath: '/cas-test/delete-soft.bin',
        requestor: TEST_USER,
        ignoreAcl: true,
      });
    });

    it('should not delete the file when references remain', async () => {
      const content = Buffer.from('shared-hash-content-' + Date.now());

      // Write same content to two paths (same hash)
      const ctx1 = await caskFs.write({
        filePath: '/cas-test/shared-a.bin',
        data: content,
        requestor: TEST_USER,
        ignoreAcl: true,
      });
      await caskFs.write({
        filePath: '/cas-test/shared-b.bin',
        data: content,
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const hash = ctx1.data.file?.hash_value;

      // delete one reference
      await caskFs.deleteFile({
        filePath: '/cas-test/shared-a.bin',
        requestor: TEST_USER,
        ignoreAcl: true,
      });

      const result = await cas.delete(hash);

      assert.strictEqual(result.fileDeleted, false, 'should not delete file when references remain');
      assert.ok(result.referencesRemaining > 0, 'should report remaining references');
      assert.ok(cas.exists(hash), 'file should still exist on disk');

      // cleanup
      await caskFs.deleteFile({
        filePath: '/cas-test/shared-b.bin',
        requestor: TEST_USER,
        ignoreAcl: true,
      });
    });
  });

  // ── Unused hash operations ─────────────────────────────────────────────────

  describe('getUnusedHashCount()', () => {
    it('should return a non-negative integer', async () => {
      const count = await cas.getUnusedHashCount();
      assert.ok(Number.isInteger(count), 'count should be an integer');
      assert.ok(count >= 0, 'count should be non-negative');
    });
  });

});
