import assert from 'assert';
import config from '../src/lib/config.js';
import aclImpl from '../src/lib/acl.js';
import { getRequestor } from '../src/lib/middleware/header-auth.js';
import { setup, teardown } from './helpers/http-setup.js';

const HEADER = 'x-user';

describe('header-auth requestor extraction', () => {

  describe('getRequestor() unit behavior', () => {
    const originalDefault = config.acl.defaultRequestor;

    before(() => {
      config.acl.defaultRequestor = 'fallback-user';
    });

    after(() => {
      config.acl.defaultRequestor = originalDefault;
    });

    it('extracts the username string from req.user set by header-auth middleware', () => {
      const req = { user: { username: 'jrmerz', roles: ['admin'] } };
      assert.strictEqual(getRequestor(req), 'jrmerz');
    });

    it('never returns the raw req.user object', () => {
      const req = { user: { username: 'jrmerz', roles: ['admin'] } };
      const result = getRequestor(req);
      assert.strictEqual(typeof result, 'string');
    });

    it('falls back to config.acl.defaultRequestor when req.user is unset (header auth disabled)', () => {
      const req = {};
      assert.strictEqual(getRequestor(req), 'fallback-user');
    });

    it('falls back to config.acl.defaultRequestor when req.user.username did not resolve', () => {
      const req = { user: { username: null, roles: [] } };
      assert.strictEqual(getRequestor(req), 'fallback-user');
    });
  });

  describe('HTTP requests with header auth enabled', () => {
    let caskFs, baseUrl;
    const originalHeaderAuthEnabled = config.headerAuth.enabled;
    const originalDefaultRequestor = config.acl.defaultRequestor;

    before(async () => {
      aclImpl.enabled = false;
      config.headerAuth.enabled = true;
      // setup() itself sets config.acl.defaultRequestor = 'test-user', so override after.
      ({ caskFs, baseUrl } = await setup());
      config.acl.defaultRequestor = 'anon-http';
    });

    after(async () => {
      config.headerAuth.enabled = originalHeaderAuthEnabled;
      config.acl.defaultRequestor = originalDefaultRequestor;
      await teardown();
    });

    it('records the extracted username, not the serialized user object, in last_modified_by on create', async () => {
      const filePath = '/header-auth-test/created.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: { [HEADER]: JSON.stringify({ username: 'jrmerz', roles: ['admin'] }) },
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'jrmerz');
    });

    it('records the extracted username on update (PUT)', async () => {
      const filePath = '/header-auth-test/updated.txt';
      await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: { [HEADER]: JSON.stringify({ username: 'alice', roles: [] }) },
        body: 'v1',
      });

      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'PUT',
        headers: { [HEADER]: JSON.stringify({ username: 'bob', roles: ['admin'] }) },
        body: 'v2',
      });
      assert.strictEqual(res.status, 200);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'bob');
    });

    it('records the extracted username on move (mv)', async () => {
      const srcPath = '/header-auth-test/mv-src.txt';
      const destPath = '/header-auth-test/mv-dest.txt';
      await fetch(`${baseUrl}/fs${srcPath}`, {
        method: 'POST',
        headers: { [HEADER]: JSON.stringify({ username: 'alice', roles: [] }) },
        body: 'content',
      });

      const res = await fetch(`${baseUrl}/fs/mv`, {
        method: 'POST',
        headers: {
          [HEADER]: JSON.stringify({ username: 'carol', roles: ['admin'] }),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ srcPath, destPath }),
      });
      assert.strictEqual(res.status, 200);

      const metaRes = await fetch(`${baseUrl}/fs${destPath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'carol');
    });

    it('falls back to config.acl.defaultRequestor when the auth header is absent', async () => {
      const filePath = '/header-auth-test/no-header.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'anon-http');
    });

    it('falls back to config.acl.defaultRequestor when the auth header is malformed JSON', async () => {
      const filePath = '/header-auth-test/bad-header.txt';
      const res = await fetch(`${baseUrl}/fs${filePath}`, {
        method: 'POST',
        headers: { [HEADER]: 'not-json' },
        body: 'hello',
      });
      assert.strictEqual(res.status, 201);

      const metaRes = await fetch(`${baseUrl}/fs${filePath}?metadata=true`);
      const metadata = await metaRes.json();
      assert.strictEqual(metadata.last_modified_by, 'anon-http');
    });
  });

  describe('HTTP requests to /lineage with header auth + ACL enabled', () => {
    let caskFs, baseUrl;
    const originalHeaderAuthEnabled = config.headerAuth.enabled;

    before(async () => {
      config.headerAuth.enabled = true;
      ({ caskFs, baseUrl } = await setup());

      // Create the fixture files with ACL bypassed, then turn enforcement on so the
      // /lineage routes below actually exercise acl.hasPermission() via getRequestor().
      await caskFs.write({ filePath: '/locked-from/derived.txt', data: Buffer.from('d'), requestor: 'setup', ignoreAcl: true });
      await caskFs.write({ filePath: '/locked-to/source.txt', data: Buffer.from('s'), requestor: 'setup', ignoreAcl: true });
      aclImpl.enabled = true;
    });

    after(async () => {
      aclImpl.enabled = false;
      config.headerAuth.enabled = originalHeaderAuthEnabled;
      await teardown();
    });

    it('denies a caller with no write permission, echoing back the extracted username (not the header object)', async () => {
      const res = await fetch(`${baseUrl}/lineage/add`, {
        method: 'POST',
        headers: { [HEADER]: JSON.stringify({ username: 'mallory', roles: [] }), 'content-type': 'application/json' },
        body: JSON.stringify({ fromPath: '/locked-from/derived.txt', sourcePath: '/locked-to/source.txt' }),
      });
      assert.strictEqual(res.status, 403);

      const body = await res.json();
      assert.strictEqual(body.details.user, 'mallory');
      assert.strictEqual(body.details.permission, 'write');
    });

    it('allows a caller with the admin role, resolved by the extracted username', async () => {
      await aclImpl.ensureUserRole({ user: 'lineage-admin', role: 'admin', dbClient: caskFs.dbClient });

      const res = await fetch(`${baseUrl}/lineage/add`, {
        method: 'POST',
        headers: { [HEADER]: JSON.stringify({ username: 'lineage-admin', roles: [] }), 'content-type': 'application/json' },
        body: JSON.stringify({ fromPath: '/locked-from/derived.txt', sourcePath: '/locked-to/source.txt' }),
      });
      assert.strictEqual(res.status, 200);
    });
  });
});
