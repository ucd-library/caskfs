import assert from 'assert';
import { setup, teardown } from './helpers/http-setup.js';
import aclImpl from '../src/lib/acl.js';
import config from '../src/lib/config.js';

// Helper to build an x-user header value understood by headerAuthMiddleware.
function userHeader(username) {
  return { 'x-user': JSON.stringify({ username }) };
}

const EXACT_URI = 'http://schema.org/harvestTestHttpExact';
const REGEX_URI = 'http://schema.org/harvestTestHttpRegex';
const NO_MATCH_URI = 'https://example.org/harvest-test-http/no-match';

describe('GET /harvest-test', () => {
  let caskFs, baseUrl, httpCaskFs;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());

    // HTTP requests are served by the controller singleton (src/controllers/caskFs.js),
    // which holds its own Rdf instance separate from the per-test caskFs above -- mutate
    // its harvesting config directly, same technique used for auto-path rule caching.
    ({ default: httpCaskFs } = await import('../src/controllers/caskFs.js'));
    httpCaskFs.rdf.filterUris = new Set([EXACT_URI]);
    httpCaskFs.rdf.filterUriMatches = [/harvestTestHttpRegex$/];
    httpCaskFs.rdf.linkPredicates = new Set([EXACT_URI]);
    httpCaskFs.rdf.linkPredicateMatches = [/harvestTestHttpRegex$/];
    httpCaskFs.rdf.literalPredicates = new Set([EXACT_URI]);
    httpCaskFs.rdf.literalPredicateMatches = [/harvestTestHttpRegex$/];
  });

  after(async () => {
    config.headerAuth.enabled = false;
    aclImpl.enabled = false;
    await teardown();
  });

  describe('when ACL is disabled (default)', () => {
    it('rejects a missing uri with 400', async () => {
      const res = await fetch(`${baseUrl}/harvest-test`);
      assert.strictEqual(res.status, 400);
    });

    it('reports an exact match for all three mechanisms', async () => {
      const res = await fetch(`${baseUrl}/harvest-test?uri=${encodeURIComponent(EXACT_URI)}`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.uri, EXACT_URI);
      for (const key of ['literal', 'filter', 'link']) {
        assert.strictEqual(body[key].matches, true);
        assert.strictEqual(body[key].matchedBy, 'exact');
      }
    });

    it('reports a regex match for all three mechanisms', async () => {
      const res = await fetch(`${baseUrl}/harvest-test?uri=${encodeURIComponent(REGEX_URI)}`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      for (const key of ['literal', 'filter', 'link']) {
        assert.strictEqual(body[key].matches, true);
        assert.strictEqual(body[key].matchedBy, 'regex');
      }
    });

    it('reports no matches for an unrelated uri', async () => {
      const res = await fetch(`${baseUrl}/harvest-test?uri=${encodeURIComponent(NO_MATCH_URI)}`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      for (const key of ['literal', 'filter', 'link']) {
        assert.strictEqual(body[key].matches, false);
      }
    });
  });

  describe('when ACL is enabled', () => {
    before(async () => {
      aclImpl.enabled = true;
      await aclImpl.ensureUserRole({ user: 'harvest-test-admin', role: 'admin', dbClient: caskFs.dbClient });
    });

    after(async () => {
      aclImpl.enabled = false;
    });

    it('rejects an unauthenticated caller with 403', async () => {
      const res = await fetch(`${baseUrl}/harvest-test?uri=${encodeURIComponent(EXACT_URI)}`);
      assert.strictEqual(res.status, 403);
    });

    it('rejects a non-admin caller with 403', async () => {
      const res = await fetch(`${baseUrl}/harvest-test?uri=${encodeURIComponent(EXACT_URI)}`, {
        headers: userHeader('regular-joe'),
      });
      assert.strictEqual(res.status, 403);
    });

    it('allows an admin caller', async () => {
      const res = await fetch(`${baseUrl}/harvest-test?uri=${encodeURIComponent(EXACT_URI)}`, {
        headers: userHeader('harvest-test-admin'),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.link.matches, true);
      assert.strictEqual(body.link.matchedBy, 'exact');
    });
  });
});
