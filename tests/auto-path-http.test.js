import assert from 'assert';
import { setup, teardown } from './helpers/http-setup.js';
import aclImpl from '../src/lib/acl.js';
import config from '../src/lib/config.js';

// Helper to build an x-user header value understood by headerAuthMiddleware.
function userHeader(username) {
  return { 'x-user': JSON.stringify({ username }) };
}

const RULES = {
  partition: [{ name: 'http-load-env', index: 0 }],
  bucket:    [{ name: 'http-load-bucket', filterRegex: '^archive$' }],
};

// Requests go through the long-lived controller singleton (src/controllers/caskFs.js),
// which caches its own AutoPath config in memory separately from the per-test caskFs
// instance. Removing rules via the per-test instance only deletes the DB rows — it does
// NOT refresh the singleton's cache, so a stale rule can otherwise leak into later test
// files that share this same node process (eg. cli.test.js's http-mode write tests).
async function cleanupRules() {
  const { default: httpCaskFs } = await import('../src/controllers/caskFs.js');
  await httpCaskFs.autoPath.partition.remove('http-load-env');
  await httpCaskFs.autoPath.bucket.remove('http-load-bucket');
  await httpCaskFs.autoPath.partition.getConfig(true);
  await httpCaskFs.autoPath.bucket.getConfig(true);
}

describe('POST /auto-path/load', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
  });

  after(async () => {
    config.headerAuth.enabled = false;
    aclImpl.enabled = false;
    await teardown();
  });

  describe('when ACL is disabled (default)', () => {
    after(cleanupRules);

    it('allows any caller to load rules', async () => {
      const res = await fetch(`${baseUrl}/auto-path/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...userHeader('nobody-in-particular') },
        body: JSON.stringify(RULES),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.results.length, 2);
      assert.ok(body.results.every(r => r.updated === true));
    });
  });

  describe('when ACL is enabled', () => {
    before(async () => {
      aclImpl.enabled = true;
      await aclImpl.ensureUserRole({ user: 'auto-path-admin', role: 'admin', dbClient: caskFs.dbClient });
    });

    after(async () => {
      aclImpl.enabled = false;
      await cleanupRules();
    });

    it('rejects an unauthenticated caller with 403', async () => {
      const res = await fetch(`${baseUrl}/auto-path/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(RULES),
      });
      assert.strictEqual(res.status, 403);
    });

    it('rejects a non-admin caller with 403', async () => {
      const res = await fetch(`${baseUrl}/auto-path/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...userHeader('regular-joe') },
        body: JSON.stringify(RULES),
      });
      assert.strictEqual(res.status, 403);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await fetch(`${baseUrl}/auto-path/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...userHeader('auto-path-admin') },
        body: JSON.stringify([1, 2, 3]),
      });
      assert.strictEqual(res.status, 400);
    });

    it('allows an admin caller and applies the rules', async () => {
      const res = await fetch(`${baseUrl}/auto-path/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...userHeader('auto-path-admin') },
        body: JSON.stringify(RULES),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.results.length, 2);
      assert.ok(body.results.every(r => r.updated === true));

      assert.strictEqual(await caskFs.autoPath.partition.exists('http-load-env'), true);
      assert.strictEqual(await caskFs.autoPath.bucket.exists('http-load-bucket'), true);
    });

    it('reports updated:false when the admin reloads identical rules (no reprocessing)', async () => {
      // rules were already applied by the previous test
      const res = await fetch(`${baseUrl}/auto-path/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...userHeader('auto-path-admin') },
        body: JSON.stringify(RULES),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.results.every(r => r.updated === false),
        'reloading an unchanged rules file should report updated:false, not reprocess');
    });
  });
});
