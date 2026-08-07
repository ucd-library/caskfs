import assert from 'assert';
import HttpCaskFsClient from '../src/lib/http-client.js';

describe('HttpCaskFsClient auth headers', () => {
  const ORIGINAL_TOKEN_ENV = process.env.CASKFS_HTTP_TOKEN;

  afterEach(() => {
    if (ORIGINAL_TOKEN_ENV === undefined) {
      delete process.env.CASKFS_HTTP_TOKEN;
    } else {
      process.env.CASKFS_HTTP_TOKEN = ORIGINAL_TOKEN_ENV;
    }
  });

  it('returns no Authorization header when no token is configured', () => {
    delete process.env.CASKFS_HTTP_TOKEN;
    const client = new HttpCaskFsClient({ host: 'http://localhost:3000' });
    assert.deepStrictEqual(client._authHeaders(), {});
  });

  it('uses opts.token when CASKFS_HTTP_TOKEN is not set', () => {
    delete process.env.CASKFS_HTTP_TOKEN;
    const client = new HttpCaskFsClient({ host: 'http://localhost:3000', token: 'ctor-token' });
    assert.deepStrictEqual(client._authHeaders(), { Authorization: 'Bearer ctor-token' });
  });

  it('CASKFS_HTTP_TOKEN overrides opts.token', () => {
    process.env.CASKFS_HTTP_TOKEN = 'env-token';
    const client = new HttpCaskFsClient({ host: 'http://localhost:3000', token: 'ctor-token' });
    assert.deepStrictEqual(client._authHeaders(), { Authorization: 'Bearer env-token' });
  });

  it('CASKFS_HTTP_TOKEN is used even when no opts.token is configured', () => {
    process.env.CASKFS_HTTP_TOKEN = 'env-token';
    const client = new HttpCaskFsClient({ host: 'http://localhost:3000' });
    assert.deepStrictEqual(client._authHeaders(), { Authorization: 'Bearer env-token' });
  });

  it('re-reads CASKFS_HTTP_TOKEN on every call instead of caching it at construction', () => {
    delete process.env.CASKFS_HTTP_TOKEN;
    const client = new HttpCaskFsClient({ host: 'http://localhost:3000' });
    assert.deepStrictEqual(client._authHeaders(), {});

    process.env.CASKFS_HTTP_TOKEN = 'late-token';
    assert.deepStrictEqual(client._authHeaders(), { Authorization: 'Bearer late-token' });
  });
});
