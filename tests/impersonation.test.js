import assert from 'assert';
import config from '../src/lib/config.js';
import { setup, teardown } from './helpers/http-setup.js';

const COOKIE = config.impersonation.cookieName;

describe('impersonation', () => {

  describe('HTTP requests with impersonation enabled', () => {
    let baseUrl;
    const originalImpersonationEnabled = config.impersonation.enabled;
    const originalDefaultRequestor = config.acl.defaultRequestor;

    before(async () => {
      config.impersonation.enabled = true;
      // setup() itself sets config.acl.defaultRequestor = 'test-user', so override after.
      ({ baseUrl } = await setup());
      config.acl.defaultRequestor = 'anon-http';
    });

    after(async () => {
      config.impersonation.enabled = originalImpersonationEnabled;
      config.acl.defaultRequestor = originalDefaultRequestor;
      await teardown();
    });

    it('records the impersonated username, from the cookie, in last_modified_by on create', async () => {
      const filePath = '/impersonation-test/created.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: { cookie: `${COOKIE}=jrmerz` },
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'jrmerz');
    });

    it('falls back to config.acl.defaultRequestor when no impersonation cookie is present', async () => {
      const filePath = '/impersonation-test/no-cookie.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, { method: 'POST', body: 'hello' });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'anon-http');
    });

    it('ignores an unrelated cookie value', async () => {
      const filePath = '/impersonation-test/other-cookie.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: { cookie: 'some_other_cookie=whatever' },
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'anon-http');
    });
  });

  describe('HTTP requests with impersonation disabled (the default)', () => {
    let baseUrl;
    const originalDefaultRequestor = config.acl.defaultRequestor;

    before(async () => {
      config.impersonation.enabled = false;
      ({ baseUrl } = await setup());
      config.acl.defaultRequestor = 'anon-http';
    });

    after(async () => {
      config.acl.defaultRequestor = originalDefaultRequestor;
      await teardown();
    });

    it('ignores the impersonation cookie entirely', async () => {
      const filePath = '/impersonation-test/disabled.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: { cookie: `${COOKIE}=jrmerz` },
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'anon-http');
    });
  });

  describe('precedence over header auth', () => {
    let baseUrl;
    const originalImpersonationEnabled = config.impersonation.enabled;
    const originalHeaderAuthEnabled = config.headerAuth.enabled;
    const originalDefaultRequestor = config.acl.defaultRequestor;

    before(async () => {
      config.impersonation.enabled = true;
      config.headerAuth.enabled = true;
      ({ baseUrl } = await setup());
      config.acl.defaultRequestor = 'anon-http';
    });

    after(async () => {
      config.impersonation.enabled = originalImpersonationEnabled;
      config.headerAuth.enabled = originalHeaderAuthEnabled;
      config.acl.defaultRequestor = originalDefaultRequestor;
      await teardown();
    });

    it('overrides the username set by header auth when both are present', async () => {
      const filePath = '/impersonation-test/precedence.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: {
          cookie: `${COOKIE}=impersonated-user`,
          'x-user': JSON.stringify({ username: 'header-user', roles: [] }),
        },
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'impersonated-user');
    });
  });
});
