import assert from 'assert';
import { setup, teardown } from './helpers/http-setup.js';
import aclImpl from '../src/lib/acl.js';
import config from '../src/lib/config.js';

const HEADER = 'x-user';

function userHeader(username) {
  return { [HEADER]: JSON.stringify({ username }) };
}

async function jsonFetch(url, opts={}) {
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

describe('/acl HTTP API — directory routes, ACL disabled (default)', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    await caskFs.write({ filePath: '/acl-http-test/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
  });

  after(async () => {
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('GET /acl/directory/* returns 404 for a directory that does not exist', async () => {
    const res = await fetch(`${baseUrl}/acl/directory/never-created-directory`);
    assert.strictEqual(res.status, 404);
  });

  it('GET /acl/directory/* returns 200 with empty permissions for an existing directory with no ACL set', async () => {
    const res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body.permissions, []);
    assert.strictEqual(body.public, false);
  });

  it('full set/get/remove round trip for a directory permission (role principal)', async () => {
    let res = await jsonFetch(`${baseUrl}/acl/directory/acl-http-test/permissions`, {
      method: 'POST', body: { principal: 'editors', permission: 'write' },
    });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    assert.strictEqual(res.status, 200);
    let body = await res.json();
    assert.deepStrictEqual(body.permissions, [{ permission: 'write', principalType: 'role', principalName: 'editors' }]);
    assert.strictEqual(body.public, false);

    res = await jsonFetch(`${baseUrl}/acl/directory/acl-http-test/permissions`, {
      method: 'DELETE', body: { principal: 'editors', permission: 'write' },
    });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    body = await res.json();
    assert.deepStrictEqual(body.permissions, []);
  });

  it('full set/get/remove round trip for a directory permission (direct user principal)', async () => {
    let res = await jsonFetch(`${baseUrl}/acl/directory/acl-http-test/permissions`, {
      method: 'POST', body: { principal: 'grace', principalType: 'user', permission: 'read' },
    });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    assert.strictEqual(res.status, 200);
    let body = await res.json();
    assert.deepStrictEqual(body.permissions, [{ permission: 'read', principalType: 'user', principalName: 'grace' }]);

    res = await jsonFetch(`${baseUrl}/acl/directory/acl-http-test/permissions`, {
      method: 'DELETE', body: { principal: 'grace', principalType: 'user', permission: 'read' },
    });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    body = await res.json();
    assert.deepStrictEqual(body.permissions, []);
  });

  it('PUT /acl/directory/*/public toggles the public flag', async () => {
    let res = await jsonFetch(`${baseUrl}/acl/directory/acl-http-test/public`, {
      method: 'PUT', body: { public: true },
    });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    assert.strictEqual((await res.json()).public, true);
  });

  it('DELETE /acl/directory/* removes the directory ACL entirely', async () => {
    let res = await fetch(`${baseUrl}/acl/directory/acl-http-test`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/directory/acl-http-test`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body.permissions, []);
    assert.strictEqual(body.public, false);
  });

  it('rejects an invalid permission value with 400', async () => {
    const res = await jsonFetch(`${baseUrl}/acl/directory/acl-http-test/permissions`, {
      method: 'POST', body: { principal: 'editors', permission: 'nope' },
    });
    assert.strictEqual(res.status, 400);
  });
});

describe('/acl HTTP API — directory routes, ACL enabled', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    config.acl.enabled = true;

    await caskFs.write({ filePath: '/dir-a/file.txt', data: Buffer.from('a'), requestor: 'setup', ignoreAcl: true });
    await caskFs.write({ filePath: '/dir-b/file.txt', data: Buffer.from('b'), requestor: 'setup', ignoreAcl: true });

    // 'dir-a-admin' is a directory-scoped admin: can manage ACLs on /dir-a only.
    await caskFs.setDirectoryPermission({ directory: '/dir-a', principal: 'dir-a-managers', permission: 'admin', ignoreAcl: true });
    await aclImpl.ensureUserRole({ user: 'dir-a-admin', role: 'dir-a-managers', dbClient: caskFs.dbClient });

    // 'global-admin' holds the global admin role: can manage ACLs anywhere.
    await aclImpl.ensureUserRole({ user: 'global-admin', role: 'admin', dbClient: caskFs.dbClient });
  });

  after(async () => {
    config.acl.enabled = false;
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('rejects an unauthenticated caller with 403', async () => {
    const res = await fetch(`${baseUrl}/acl/directory/dir-a`);
    assert.strictEqual(res.status, 403);
  });

  it('rejects a caller with no permissions on the directory with 403', async () => {
    const res = await fetch(`${baseUrl}/acl/directory/dir-a`, { headers: userHeader('random-joe') });
    assert.strictEqual(res.status, 403);
  });

  it('allows a directory-scoped admin to manage ACLs on their own directory', async () => {
    const res = await jsonFetch(`${baseUrl}/acl/directory/dir-a/permissions`, {
      method: 'POST', headers: userHeader('dir-a-admin'), body: { principal: 'dir-a-readers', permission: 'read' },
    });
    assert.strictEqual(res.status, 200);
  });

  it('allows a directory-scoped admin to grant a direct user permission on their own directory', async () => {
    const res = await jsonFetch(`${baseUrl}/acl/directory/dir-a/permissions`, {
      method: 'POST', headers: userHeader('dir-a-admin'), body: { principal: 'henry', principalType: 'user', permission: 'read' },
    });
    assert.strictEqual(res.status, 200);
  });

  it('denies a directory-scoped admin write access on a different directory (per-directory, not global)', async () => {
    const res = await jsonFetch(`${baseUrl}/acl/directory/dir-b/permissions`, {
      method: 'POST', headers: userHeader('dir-a-admin'), body: { principal: 'dir-b-readers', permission: 'read' },
    });
    assert.strictEqual(res.status, 403);
  });

  it('allows the global admin to manage ACLs on any directory', async () => {
    const res = await jsonFetch(`${baseUrl}/acl/directory/dir-b/permissions`, {
      method: 'POST', headers: userHeader('global-admin'), body: { principal: 'dir-b-readers', permission: 'read' },
    });
    assert.strictEqual(res.status, 200);
  });
});

describe('GET /dir and /fs — public directory, ACL enabled', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    config.acl.enabled = true;

    await caskFs.write({ filePath: '/pub/readme.txt', data: Buffer.from('hello'), requestor: 'setup', ignoreAcl: true });
    // seeded BEFORE the public flag is set, to prove the flag cascades to existing children
    await caskFs.write({ filePath: '/pub/sub/nested.txt', data: Buffer.from('deep'), requestor: 'setup', ignoreAcl: true });
    await caskFs.setDirectoryPublic({ directory: '/pub', permission: true, ignoreAcl: true });
  });

  after(async () => {
    config.acl.enabled = false;
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('GET /dir/pub with no auth header lists the file and the child subdirectory', async () => {
    const res = await fetch(`${baseUrl}/dir/pub`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.files.some(f => f.filename === 'readme.txt'));
    assert.ok(body.directories.some(d => d.name === 'sub'));
  });

  it('GET /dir/pub for an authenticated user unknown to the ACL system still lists children', async () => {
    // this user has a valid x-user header (authenticated upstream) but was never
    // provisioned into CaskFS's acl_user table via a role/permission grant
    const res = await fetch(`${baseUrl}/dir/pub`, { headers: userHeader('never-provisioned-user') });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.files.some(f => f.filename === 'readme.txt'));
    assert.ok(body.directories.some(d => d.name === 'sub'));
  });

  it('GET /dir/pub/sub descends into the inherited-public subdirectory', async () => {
    const res = await fetch(`${baseUrl}/dir/pub/sub`, { headers: userHeader('never-provisioned-user') });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.files.some(f => f.filename === 'nested.txt'));
  });

  it('GET /fs/pub/readme.txt with no auth header succeeds', async () => {
    const res = await fetch(`${baseUrl}/fs/pub/readme.txt`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'hello');
  });

  it('POST /fs/pub/new.txt with no auth header is denied — public grants read only, never write', async () => {
    const res = await fetch(`${baseUrl}/fs/pub/new.txt`, { method: 'POST', body: 'nope' });
    assert.strictEqual(res.status, 403);
  });
});

describe('/acl HTTP API — global roles/users routes', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    config.acl.enabled = true;

    await caskFs.write({ filePath: '/global-acl-test/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
    await caskFs.setDirectoryPermission({ directory: '/global-acl-test', principal: 'local-managers', permission: 'admin', ignoreAcl: true });
    await aclImpl.ensureUserRole({ user: 'local-only-admin', role: 'local-managers', dbClient: caskFs.dbClient });

    await aclImpl.ensureUserRole({ user: 'global-admin-2', role: 'admin', dbClient: caskFs.dbClient });
  });

  after(async () => {
    config.acl.enabled = false;
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('rejects an unauthenticated caller with 403', async () => {
    const res = await fetch(`${baseUrl}/acl/roles`);
    assert.strictEqual(res.status, 403);
  });

  it('rejects a directory-scoped (non-global) admin with 403 — global routes require the global admin role', async () => {
    const res = await fetch(`${baseUrl}/acl/roles`, { headers: userHeader('local-only-admin') });
    assert.strictEqual(res.status, 403);
  });

  it('GET /acl/users/:user/roles allows a non-admin caller to look up their own roles', async () => {
    const res = await fetch(`${baseUrl}/acl/users/local-only-admin/roles`, { headers: userHeader('local-only-admin') });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { total: 1, roles: ['local-managers'] });
  });

  it('GET /acl/users/:user/roles still rejects a non-admin caller looking up someone else', async () => {
    const res = await fetch(`${baseUrl}/acl/users/global-admin-2/roles`, { headers: userHeader('local-only-admin') });
    assert.strictEqual(res.status, 403);
  });

  it('GET /acl/users rejects a directory-scoped (non-global) admin with 403', async () => {
    const res = await fetch(`${baseUrl}/acl/users`, { headers: userHeader('local-only-admin') });
    assert.strictEqual(res.status, 403);
  });

  it('runs the full role/user management flow for a global admin', async () => {
    const admin = userHeader('global-admin-2');

    let res = await jsonFetch(`${baseUrl}/acl/roles`, { method: 'POST', headers: admin, body: { role: 'billing' } });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/roles`, { headers: admin });
    assert.strictEqual(res.status, 200);
    let body = await res.json();
    assert.ok(body.roles.some(r => r.role === 'billing'));
    assert.strictEqual(typeof body.total, 'number');

    res = await jsonFetch(`${baseUrl}/acl/users/dana/roles`, { method: 'POST', headers: admin, body: { role: 'billing' } });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/users/dana/roles`, { headers: admin });
    assert.deepStrictEqual(await res.json(), { total: 1, roles: ['billing'] });

    res = await fetch(`${baseUrl}/acl/users`, { headers: admin });
    assert.strictEqual(res.status, 200);
    assert.ok((await res.json()).users.some(u => u.user === 'dana'));

    res = await fetch(`${baseUrl}/acl/roles/billing/users`, { headers: admin });
    assert.strictEqual(res.status, 200);
    assert.ok((await res.json()).users.some(u => u.user === 'dana'));

    res = await fetch(`${baseUrl}/acl/users/dana/roles/billing`, { method: 'DELETE', headers: admin });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/users/dana/roles`, { headers: admin });
    assert.deepStrictEqual(await res.json(), { total: 0, roles: [] });

    res = await fetch(`${baseUrl}/acl/users/dana`, { method: 'DELETE', headers: admin });
    assert.strictEqual(res.status, 200);

    res = await fetch(`${baseUrl}/acl/roles/billing`, { method: 'DELETE', headers: admin });
    assert.strictEqual(res.status, 200);
  });

  it('GET /acl/roles supports ?search= and ?limit=&offset= pagination', async () => {
    const admin = userHeader('global-admin-2');
    for ( const name of ['http-pg-a', 'http-pg-b', 'http-pg-c', 'http-pg-d', 'http-other'] ) {
      const res = await jsonFetch(`${baseUrl}/acl/roles`, { method: 'POST', headers: admin, body: { role: name } });
      assert.strictEqual(res.status, 200);
    }

    let res = await fetch(`${baseUrl}/acl/roles?search=http-pg-`, { headers: admin });
    let body = await res.json();
    assert.strictEqual(body.total, 4);
    assert.ok(body.roles.every(r => r.role.startsWith('http-pg-')));

    res = await fetch(`${baseUrl}/acl/roles?search=no-such-role-xyz`, { headers: admin });
    assert.deepStrictEqual(await res.json(), { total: 0, roles: [] });

    res = await fetch(`${baseUrl}/acl/roles?search=http-pg-&limit=2&offset=0`, { headers: admin });
    const page1 = await res.json();
    res = await fetch(`${baseUrl}/acl/roles?search=http-pg-&limit=2&offset=2`, { headers: admin });
    const page2 = await res.json();
    assert.strictEqual(page1.total, 4);
    assert.strictEqual(page1.roles.length, 2);
    assert.strictEqual(page2.roles.length, 2);
    const names = [...page1.roles, ...page2.roles].map(r => r.role);
    assert.strictEqual(new Set(names).size, 4, 'no duplicates/gaps across pages');
  });

  it('GET /acl/roles rejects a non-numeric ?limit= with 400', async () => {
    const admin = userHeader('global-admin-2');
    const res = await fetch(`${baseUrl}/acl/roles?limit=not-a-number`, { headers: admin });
    assert.strictEqual(res.status, 400);
  });

  it('GET /acl/roles/:role/users supports ?search= and ?limit=&offset= pagination, scoped to one role', async () => {
    const admin = userHeader('global-admin-2');
    await jsonFetch(`${baseUrl}/acl/roles`, { method: 'POST', headers: admin, body: { role: 'http-scoped-role' } });
    for ( const name of ['http-mem-a', 'http-mem-b', 'http-mem-c', 'http-mem-d'] ) {
      await jsonFetch(`${baseUrl}/acl/users/${name}/roles`, { method: 'POST', headers: admin, body: { role: 'http-scoped-role' } });
    }
    // an unrelated user/role should never show up in this role's member list
    await jsonFetch(`${baseUrl}/acl/users/http-unrelated/roles`, { method: 'POST', headers: admin, body: { role: 'http-unrelated-role' } });

    let res = await fetch(`${baseUrl}/acl/roles/http-scoped-role/users?search=http-mem-b`, { headers: admin });
    let body = await res.json();
    assert.strictEqual(body.total, 1);
    assert.strictEqual(body.users[0].user, 'http-mem-b');

    res = await fetch(`${baseUrl}/acl/roles/http-scoped-role/users?limit=2&offset=0`, { headers: admin });
    const page1 = await res.json();
    res = await fetch(`${baseUrl}/acl/roles/http-scoped-role/users?limit=2&offset=2`, { headers: admin });
    const page2 = await res.json();
    assert.strictEqual(page1.total, 4);
    assert.strictEqual(page1.users.length, 2);
    assert.strictEqual(page2.users.length, 2);
    const names = [...page1.users, ...page2.users].map(u => u.user);
    assert.strictEqual(new Set(names).size, 4, 'no duplicates/gaps across pages');
  });

  it('GET /acl/users/:user/roles supports ?search= and ?limit=&offset= pagination, scoped to one user', async () => {
    const admin = userHeader('global-admin-2');
    for ( const name of ['http-role-a', 'http-role-b', 'http-role-c', 'http-role-d'] ) {
      await jsonFetch(`${baseUrl}/acl/users/http-scoped-user/roles`, { method: 'POST', headers: admin, body: { role: name } });
    }

    let res = await fetch(`${baseUrl}/acl/users/http-scoped-user/roles?search=http-role-b`, { headers: admin });
    let body = await res.json();
    assert.strictEqual(body.total, 1);
    assert.deepStrictEqual(body.roles, ['http-role-b']);

    res = await fetch(`${baseUrl}/acl/users/http-scoped-user/roles?limit=2&offset=0`, { headers: admin });
    const page1 = await res.json();
    res = await fetch(`${baseUrl}/acl/users/http-scoped-user/roles?limit=2&offset=2`, { headers: admin });
    const page2 = await res.json();
    assert.strictEqual(page1.total, 4);
    assert.strictEqual(page1.roles.length, 2);
    assert.strictEqual(page2.roles.length, 2);
    const names = [...page1.roles, ...page2.roles];
    assert.strictEqual(new Set(names).size, 4, 'no duplicates/gaps across pages');
  });
});

describe('GET /acl/test', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    config.acl.enabled = true;

    await caskFs.write({ filePath: '/test-endpoint/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
    await caskFs.setDirectoryPermission({ directory: '/test-endpoint', principal: 'readers', permission: 'read', ignoreAcl: true });
    await aclImpl.ensureUserRole({ user: 'eve', role: 'readers', dbClient: caskFs.dbClient });
    await aclImpl.ensureUserRole({ user: 'test-admin', role: 'admin', dbClient: caskFs.dbClient });
  });

  after(async () => {
    config.acl.enabled = false;
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('rejects a non-admin caller with 403', async () => {
    const url = new URL(`${baseUrl}/acl/test`);
    url.searchParams.set('filePath', '/test-endpoint/file.txt');
    url.searchParams.set('permission', 'read');
    url.searchParams.set('user', 'eve');
    url.searchParams.set('isFile', 'true');
    const res = await fetch(url, { headers: userHeader('eve') });
    assert.strictEqual(res.status, 403);
  });

  it('reports true for a permission the target user has, false for one they lack', async () => {
    const admin = userHeader('test-admin');

    let url = new URL(`${baseUrl}/acl/test`);
    url.searchParams.set('filePath', '/test-endpoint/file.txt');
    url.searchParams.set('permission', 'read');
    url.searchParams.set('user', 'eve');
    url.searchParams.set('isFile', 'true');
    let res = await fetch(url, { headers: admin });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).hasPermission, true);

    url.searchParams.set('permission', 'write');
    res = await fetch(url, { headers: admin });
    assert.strictEqual((await res.json()).hasPermission, false);
  });
});

describe('GET /acl/directory/*/my-permission', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    config.acl.enabled = true;

    await caskFs.write({ filePath: '/my-permission-test/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
    await caskFs.setDirectoryPermission({ directory: '/my-permission-test', principal: 'mp-writers', permission: 'write', ignoreAcl: true });
    await aclImpl.ensureUserRole({ user: 'mp-writer', role: 'mp-writers', dbClient: caskFs.dbClient });
    await aclImpl.ensureUserRole({ user: 'mp-admin', role: 'admin', dbClient: caskFs.dbClient });
  });

  after(async () => {
    config.acl.enabled = false;
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('does not require the caller to be an admin, unlike /acl/test', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'write');
    const res = await fetch(url, { headers: userHeader('mp-writer') });
    assert.strictEqual(res.status, 200);
  });

  it('reports true for a permission the caller has', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'write');
    const res = await fetch(url, { headers: userHeader('mp-writer') });
    assert.deepStrictEqual(await res.json(), {
      directory: '/my-permission-test', permissions: { write: true }
    });
  });

  it('reports false (not an error) for a permission the caller lacks', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'admin');
    const res = await fetch(url, { headers: userHeader('mp-writer') });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).permissions.admin, false);
  });

  it('reports true for a global admin', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'admin');
    const res = await fetch(url, { headers: userHeader('mp-admin') });
    assert.strictEqual((await res.json()).permissions.admin, true);
  });

  it('reports false for an unauthenticated caller checking write', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'write');
    const res = await fetch(url);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).permissions.write, false);
  });

  it('rejects an invalid permission value with 400', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'nope');
    const res = await fetch(url, { headers: userHeader('mp-writer') });
    assert.strictEqual(res.status, 400);
  });

  it('reports true for anyone when ACL is disabled', async () => {
    config.acl.enabled = false;
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'admin');
    const res = await fetch(url);
    assert.strictEqual((await res.json()).permissions.admin, true);
    config.acl.enabled = true;
  });

  it('reports multiple permissions in a single request via a comma-separated value', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.set('permission', 'write,admin');
    const res = await fetch(url, { headers: userHeader('mp-writer') });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), {
      directory: '/my-permission-test', permissions: { write: true, admin: false }
    });
  });

  it('reports multiple permissions in a single request via repeated params', async () => {
    const url = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    url.searchParams.append('permission', 'write');
    url.searchParams.append('permission', 'admin');
    const res = await fetch(url, { headers: userHeader('mp-writer') });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), {
      directory: '/my-permission-test', permissions: { write: true, admin: false }
    });
  });

  it('combined multi-permission request matches two separate single-permission requests', async () => {
    const combinedUrl = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    combinedUrl.searchParams.set('permission', 'write,admin');
    const combined = await (await fetch(combinedUrl, { headers: userHeader('mp-writer') })).json();

    const writeUrl = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    writeUrl.searchParams.set('permission', 'write');
    const write = await (await fetch(writeUrl, { headers: userHeader('mp-writer') })).json();

    const adminUrl = new URL(`${baseUrl}/acl/directory/my-permission-test/my-permission`);
    adminUrl.searchParams.set('permission', 'admin');
    const admin = await (await fetch(adminUrl, { headers: userHeader('mp-writer') })).json();

    assert.deepStrictEqual(combined.permissions, {
      write: write.permissions.write,
      admin: admin.permissions.admin
    });
  });
});

describe('GET /acl/whoami', () => {
  let caskFs, baseUrl;

  before(async () => {
    config.headerAuth.enabled = true;
    ({ caskFs, baseUrl } = await setup());
    config.acl.enabled = true;

    await aclImpl.ensureUserRole({ user: 'whoami-viewer', role: 'viewer', dbClient: caskFs.dbClient });
    await aclImpl.ensureUserRole({ user: 'whoami-admin', role: 'admin', dbClient: caskFs.dbClient });
  });

  after(async () => {
    config.acl.enabled = false;
    config.headerAuth.enabled = false;
    await teardown();
  });

  it('falls back to config.acl.defaultRequestor when the auth header is absent, with no error', async () => {
    // setup() sets config.acl.defaultRequestor = 'test-user' (see helpers/http-setup.js),
    // which is never assigned a role here, so it resolves to a real but non-admin identity.
    const res = await fetch(`${baseUrl}/acl/whoami`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { username: 'test-user', roles: [], isAdmin: false });
  });

  it('reports a non-admin caller\'s own username/roles with isAdmin:false', async () => {
    const res = await fetch(`${baseUrl}/acl/whoami`, { headers: userHeader('whoami-viewer') });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { username: 'whoami-viewer', roles: ['viewer'], isAdmin: false });
  });

  it('reports isAdmin:true for a global admin caller', async () => {
    const res = await fetch(`${baseUrl}/acl/whoami`, { headers: userHeader('whoami-admin') });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.username, 'whoami-admin');
    assert.deepStrictEqual(body.roles, ['admin']);
    assert.strictEqual(body.isAdmin, true);
  });
});
