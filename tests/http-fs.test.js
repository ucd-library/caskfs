import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { setup, teardown } from './helpers/http-setup.js';

// Content is 28 bytes:
// H(0)e(1)l(2)l(3)o(4),(5) (6)C(7)a(8)s(9)k(10)F(11)S(12) (13)R(14)a(15)n(16)g(17)e(18) (19)S(20)u(21)p(22)p(23)o(24)r(25)t(26)!(27)
const TEST_FILE = '/http-test/hello.txt';
const TEST_CONTENT = 'Hello, CaskFS Range Support!';

describe('HTTP File Read Endpoint', () => {
  let caskFs, baseUrl;

  before(async () => {
    ({ caskFs, baseUrl } = await setup());
    await caskFs.write({
      filePath: TEST_FILE,
      data: Buffer.from(TEST_CONTENT),
      requestor: 'test-user',
      ignoreAcl: true,
    });
  });

  after(async () => {
    await teardown();
  });

  describe('GET /fs - full file', () => {
    it('should return 200 with full file content', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`);
      assert.strictEqual(res.status, 200);
      const body = await res.text();
      assert.strictEqual(body, TEST_CONTENT);
    });

    it('should include Accept-Ranges: bytes header', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`);
      assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');
    });

    it('should include Content-Length matching file size', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`);
      assert.strictEqual(res.headers.get('content-length'), String(Buffer.byteLength(TEST_CONTENT)));
    });

    it('should include an ETag header', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`);
      assert.ok(res.headers.get('etag'), 'should have an ETag header');
    });

    it('should return 304 when If-None-Match matches ETag', async () => {
      const first = await fetch(`${baseUrl}/fs${TEST_FILE}`);
      const etag = first.headers.get('etag');
      assert.ok(etag, 'need an ETag to test conditional request');

      const second = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { 'if-none-match': etag },
      });
      assert.strictEqual(second.status, 304);
    });

    it('should return metadata JSON when ?metadata=true', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}?metadata=true`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.hash_value, 'metadata should include hash_value');
      assert.strictEqual(body.filename, 'hello.txt');
    });

    it('should return 404 for a non-existent file', async () => {
      const res = await fetch(`${baseUrl}/fs/does/not/exist.txt`);
      assert.strictEqual(res.status, 404);
    });
  });

  describe('GET /fs - byte range requests', () => {
    it('should return 206 for a valid range request', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=0-4' },
      });
      assert.strictEqual(res.status, 206);
      const body = await res.text();
      assert.strictEqual(body, 'Hello');
    });

    it('should include correct Content-Range and Content-Length for partial response', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=0-4' },
      });
      assert.strictEqual(res.headers.get('content-range'), `bytes 0-4/${TEST_CONTENT.length}`);
      assert.strictEqual(res.headers.get('content-length'), '5');
    });

    it('should return a mid-file range', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=7-12' },
      });
      assert.strictEqual(res.status, 206);
      assert.strictEqual(await res.text(), 'CaskFS');
    });

    it('should return an open-ended range (bytes=N-)', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=20-' },
      });
      assert.strictEqual(res.status, 206);
      assert.strictEqual(await res.text(), 'Support!');
    });

    it('should return a suffix range (bytes=-N)', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=-8' },
      });
      assert.strictEqual(res.status, 206);
      assert.strictEqual(await res.text(), 'Support!');
    });

    it('should return 416 when range start is beyond file size', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=9999-9999' },
      });
      assert.strictEqual(res.status, 416);
      assert.ok(res.headers.get('content-range').startsWith('bytes */'), 'should include content-range with total size');
    });

    it('should return 416 when range start exceeds end', async () => {
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: 'bytes=10-5' },
      });
      assert.strictEqual(res.status, 416);
    });

    it('should clamp end to file size for a range that overshoots', async () => {
      const size = TEST_CONTENT.length;
      const res = await fetch(`${baseUrl}/fs${TEST_FILE}`, {
        headers: { range: `bytes=20-9999` },
      });
      assert.strictEqual(res.status, 206);
      const expectedEnd = size - 1;
      assert.strictEqual(
        res.headers.get('content-range'),
        `bytes 20-${expectedEnd}/${size}`
      );
      assert.strictEqual(await res.text(), 'Support!');
    });
  });
});

// ---------------------------------------------------------------------------
// POST /fs/copy endpoint tests
// ---------------------------------------------------------------------------

describe('POST /fs/copy', () => {
  let caskFs, baseUrl;

  const SRC_FILE    = '/cp-api-test/src.txt';
  const SRC_CONTENT = 'copy source content';

  before(async () => {
    ({ caskFs, baseUrl } = await setup());
    await caskFs.write({
      filePath: SRC_FILE,
      data: Buffer.from(SRC_CONTENT),
      requestor: 'test-user',
      ignoreAcl: true,
    });
    for (const name of ['a.txt', 'b.txt']) {
      await caskFs.write({
        filePath: `/cp-api-test/dir/${name}`,
        data: Buffer.from(`dir file ${name}`),
        requestor: 'test-user',
        ignoreAcl: true,
      });
    }
  });

  after(async () => {
    await teardown();
  });

  /**
   * @function post
   * @description POST to the /fs/copy endpoint with a JSON body.
   * @param {Object} body
   * @returns {Promise<Response>}
   */
  async function post(body) {
    return fetch(`${baseUrl}/fs/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('should return 400 when srcPath is missing', async () => {
    const res = await post({ destPath: '/cp-api-test/dest.txt' });
    assert.strictEqual(res.status, 400);
  });

  it('should return 400 when destPath is missing', async () => {
    const res = await post({ srcPath: SRC_FILE });
    assert.strictEqual(res.status, 400);
  });

  it('should copy a single file and return 200 with file descriptor', async () => {
    const res = await post({ srcPath: SRC_FILE, destPath: '/cp-api-test/dest.txt' });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.hash_value, 'response should include hash_value');
  });

  it('should make the copied file readable at the destination', async () => {
    const res = await fetch(`${baseUrl}/fs/cp-api-test/dest.txt`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text, SRC_CONTENT);
  });

  it('should return 409 when dest already exists and replace is false', async () => {
    const res = await post({ srcPath: SRC_FILE, destPath: '/cp-api-test/dest.txt', replace: false });
    console.log(res.status, await res.text());
    assert.strictEqual(res.status, 409);
  });

  it('should overwrite an existing destination when replace is true', async () => {
    const res = await post({ srcPath: SRC_FILE, destPath: '/cp-api-test/dest.txt', replace: true });
    assert.strictEqual(res.status, 200);
  });

  it('should copy a directory and return copied count', async () => {
    const res = await post({ srcPath: '/cp-api-test/dir', destPath: '/cp-api-test/dir-copy' });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.copied, 2);
    assert.strictEqual(body.errors.length, 0);
  });

  it('should make copied directory files readable', async () => {
    for (const name of ['a.txt', 'b.txt']) {
      const res = await fetch(`${baseUrl}/fs/cp-api-test/dir-copy/${name}`);
      assert.strictEqual(res.status, 200, `${name} should be readable after dir copy`);
      const text = await res.text();
      assert.strictEqual(text, `dir file ${name}`);
    }
  });

  it('should move a file (source deleted) when move is true', async () => {
    await caskFs.write({
      filePath: '/cp-api-test/move-src.txt',
      data: Buffer.from('move content'),
      requestor: 'test-user',
      ignoreAcl: true,
    });

    const res = await post({
      srcPath:  '/cp-api-test/move-src.txt',
      destPath: '/cp-api-test/move-dest.txt',
      move: true,
    });
    assert.strictEqual(res.status, 200);

    const destRes = await fetch(`${baseUrl}/fs/cp-api-test/move-dest.txt`);
    assert.strictEqual(destRes.status, 200, 'destination should be readable after move');

    const srcRes = await fetch(`${baseUrl}/fs/cp-api-test/move-src.txt?metadata=true`);
    assert.strictEqual(srcRes.status, 404, 'source should be gone after move');
  });
});

// ---------------------------------------------------------------------------
// Transfer (import / export) endpoint tests
// ---------------------------------------------------------------------------

const TRANSFER_FILES = [
  { path: '/transfer-test/a.txt',     content: 'alpha' },
  { path: '/transfer-test/b.txt',     content: 'beta'  },
  { path: '/transfer-test/sub/c.txt', content: 'gamma' },
];

describe('HTTP Transfer Endpoints', () => {
  let caskFs, baseUrl, tmpDir, exportFile;

  before(async () => {
    ({ caskFs, baseUrl } = await setup());
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caskfs-transfer-test-'));
    exportFile = path.join(tmpDir, 'test-export.tar.gz');

    for (const f of TRANSFER_FILES) {
      await caskFs.write({
        filePath: f.path,
        data: Buffer.from(f.content),
        requestor: 'test-user',
        ignoreAcl: true,
      });
    }
  });

  after(async () => {
    await teardown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('GET /transfer/export', () => {
    it('should return 400 when rootDir is missing', async () => {
      const res = await fetch(`${baseUrl}/transfer/export`);
      assert.strictEqual(res.status, 400);
    });

    it('should return 200 with content-type application/gzip', async () => {
      const res = await fetch(`${baseUrl}/transfer/export?rootDir=/transfer-test`);
      assert.strictEqual(res.status, 200);
      assert.ok(
        res.headers.get('content-type').includes('application/gzip'),
        `expected application/gzip, got: ${res.headers.get('content-type')}`
      );
    });

    it('should include a content-disposition header with a .tar.gz filename', async () => {
      const res = await fetch(`${baseUrl}/transfer/export?rootDir=/transfer-test`);
      const cd = res.headers.get('content-disposition') || '';
      assert.ok(cd.includes('.tar.gz'), `expected .tar.gz in content-disposition: ${cd}`);
    });

    it('should stream a non-empty archive body', async () => {
      const res = await fetch(`${baseUrl}/transfer/export?rootDir=/transfer-test`);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 0, 'archive body should not be empty');

      // gzip magic bytes: 0x1f 0x8b
      assert.strictEqual(buf[0], 0x1f, 'first byte should be 0x1f (gzip magic)');
      assert.strictEqual(buf[1], 0x8b, 'second byte should be 0x8b (gzip magic)');

      // Save for the import tests below
      await fs.writeFile(exportFile, buf);
    });
  });

});
