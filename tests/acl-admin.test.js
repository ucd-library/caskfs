import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';
import aclImpl from '../src/lib/acl.js';

// These tests cover the CaskFs-level global user/role management methods
// (ensureUser/removeUser/ensureRole/removeRole/setUserRole/removeUserRole/
// getUserRoles/getRole/getRoles/testPermission) - distinct from the per-directory
// permission checks already covered by tests/acl.test.js.
//
// They exist to guard two bugs fixed alongside the new /acl HTTP controller:
//   1. allowAdminAction() used to never throw, so these methods ran unconditionally
//      regardless of the requestor's admin status.
//   2. removeUserRole() read context.user (always undefined) and never passed
//      role/dbClient to acl.removeUserRole(), so it always threw.

describe('CaskFs ACL admin methods', () => {

  describe('when ACL is disabled (default)', () => {
    let caskFs;

    before(async () => {
      aclImpl.enabled = false;
      caskFs = await setup();
    });

    after(async () => {
      await teardown();
    });

    it('ensureUser/removeUser round-trip', async () => {
      await caskFs.ensureUser({ user: 'temp-user' });
      await caskFs.removeUser({ user: 'temp-user' });
    });

    it('ensureRole/removeRole round-trip', async () => {
      await caskFs.ensureRole({ role: 'temp-role' });
      await caskFs.removeRole({ role: 'temp-role' });
    });

    it('setUserRole assigns a role, getUserRoles/getRole/getRoles reflect it', async () => {
      await caskFs.setUserRole({ user: 'alice', role: 'editor' });

      const userRoles = await caskFs.getUserRoles({ user: 'alice' });
      assert.ok(userRoles.roles.includes('editor'));

      const roleUsers = await caskFs.getRole({ role: 'editor' });
      assert.ok(roleUsers.users.some(r => r.user === 'alice'));

      const roles = await caskFs.getRoles();
      assert.ok(roles.roles.some(r => r.role === 'editor'));

      const users = await caskFs.getUsers();
      assert.ok(users.users.some(u => u.user === 'alice'));
    });

    it('removeUserRole actually removes the association (regression: used to always throw)', async () => {
      await caskFs.setUserRole({ user: 'bob', role: 'viewer' });
      assert.ok((await caskFs.getUserRoles({ user: 'bob' })).roles.includes('viewer'));

      await caskFs.removeUserRole({ user: 'bob', role: 'viewer' });

      assert.ok(!(await caskFs.getUserRoles({ user: 'bob' })).roles.includes('viewer'));
    });

    it('getRoles supports search filtering and pagination', async () => {
      for ( const name of ['pg-alpha', 'pg-beta', 'pg-gamma', 'pg-delta', 'other-role'] ) {
        await aclImpl.ensureRole({ role: name, dbClient: caskFs.dbClient });
      }

      const searched = await caskFs.getRoles({ search: 'pg-' });
      assert.strictEqual(searched.total, 4);
      assert.ok(searched.roles.every(r => r.role.startsWith('pg-')));

      const noMatch = await caskFs.getRoles({ search: 'no-such-prefix' });
      assert.deepStrictEqual(noMatch, { total: 0, roles: [] });

      const page1 = await caskFs.getRoles({ search: 'pg-', limit: 2, offset: 0 });
      const page2 = await caskFs.getRoles({ search: 'pg-', limit: 2, offset: 2 });
      assert.strictEqual(page1.total, 4);
      assert.strictEqual(page1.roles.length, 2);
      assert.strictEqual(page2.roles.length, 2);
      const allNames = [...page1.roles, ...page2.roles].map(r => r.role);
      assert.strictEqual(new Set(allNames).size, 4, 'no duplicates/gaps across pages');
    });

    it('getUsers supports search filtering and pagination', async () => {
      for ( const name of ['pu-alpha', 'pu-beta', 'pu-gamma', 'pu-delta', 'other-user'] ) {
        await aclImpl.ensureUser({ user: name, dbClient: caskFs.dbClient });
      }

      const searched = await caskFs.getUsers({ search: 'pu-' });
      assert.strictEqual(searched.total, 4);
      assert.ok(searched.users.every(u => u.user.startsWith('pu-')));

      const noMatch = await caskFs.getUsers({ search: 'no-such-prefix' });
      assert.deepStrictEqual(noMatch, { total: 0, users: [] });

      const page1 = await caskFs.getUsers({ search: 'pu-', limit: 2, offset: 0 });
      const page2 = await caskFs.getUsers({ search: 'pu-', limit: 2, offset: 2 });
      assert.strictEqual(page1.total, 4);
      assert.strictEqual(page1.users.length, 2);
      assert.strictEqual(page2.users.length, 2);
      const allNames = [...page1.users, ...page2.users].map(u => u.user);
      assert.strictEqual(new Set(allNames).size, 4, 'no duplicates/gaps across pages');
    });

    it('getRole (role membership) supports search filtering and pagination scoped to one role', async () => {
      await aclImpl.ensureRole({ role: 'pg-scoped-role', dbClient: caskFs.dbClient });
      for ( const name of ['pgm-alpha', 'pgm-beta', 'pgm-gamma', 'pgm-delta'] ) {
        await aclImpl.ensureUserRole({ user: name, role: 'pg-scoped-role', dbClient: caskFs.dbClient });
      }
      // an unrelated user in an unrelated role should never show up
      await aclImpl.ensureUserRole({ user: 'unrelated-user', role: 'unrelated-role', dbClient: caskFs.dbClient });

      const all = await caskFs.getRole({ role: 'pg-scoped-role' });
      assert.strictEqual(all.total, 4);
      assert.ok(all.users.every(u => u.user.startsWith('pgm-')));

      const searched = await caskFs.getRole({ role: 'pg-scoped-role', search: 'beta' });
      assert.strictEqual(searched.total, 1);
      assert.strictEqual(searched.users[0].user, 'pgm-beta');

      const noMatch = await caskFs.getRole({ role: 'pg-scoped-role', search: 'no-such-prefix' });
      assert.deepStrictEqual(noMatch, { total: 0, users: [] });

      const page1 = await caskFs.getRole({ role: 'pg-scoped-role', limit: 2, offset: 0 });
      const page2 = await caskFs.getRole({ role: 'pg-scoped-role', limit: 2, offset: 2 });
      assert.strictEqual(page1.users.length, 2);
      assert.strictEqual(page2.users.length, 2);
      const allNames = [...page1.users, ...page2.users].map(u => u.user);
      assert.strictEqual(new Set(allNames).size, 4, 'no duplicates/gaps across pages');
    });

    it('getUserRoles supports search filtering and pagination scoped to one user', async () => {
      for ( const name of ['pgr-alpha', 'pgr-beta', 'pgr-gamma', 'pgr-delta'] ) {
        await aclImpl.ensureUserRole({ user: 'pg-scoped-user', role: name, dbClient: caskFs.dbClient });
      }
      // an unrelated role on an unrelated user should never show up
      await aclImpl.ensureUserRole({ user: 'unrelated-user-2', role: 'unrelated-role-2', dbClient: caskFs.dbClient });

      const all = await caskFs.getUserRoles({ user: 'pg-scoped-user' });
      assert.strictEqual(all.total, 4);
      assert.ok(all.roles.every(r => r.startsWith('pgr-')));

      const searched = await caskFs.getUserRoles({ user: 'pg-scoped-user', search: 'beta' });
      assert.strictEqual(searched.total, 1);
      assert.strictEqual(searched.roles[0], 'pgr-beta');

      const noMatch = await caskFs.getUserRoles({ user: 'pg-scoped-user', search: 'no-such-prefix' });
      assert.deepStrictEqual(noMatch, { total: 0, roles: [] });

      const page1 = await caskFs.getUserRoles({ user: 'pg-scoped-user', limit: 2, offset: 0 });
      const page2 = await caskFs.getUserRoles({ user: 'pg-scoped-user', limit: 2, offset: 2 });
      assert.strictEqual(page1.roles.length, 2);
      assert.strictEqual(page2.roles.length, 2);
      const allNames = [...page1.roles, ...page2.roles];
      assert.strictEqual(new Set(allNames).size, 4, 'no duplicates/gaps across pages');
    });

    it('testPermission evaluates a directory permission for a given user', async () => {
      await caskFs.write({ filePath: '/perm-test/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
      await caskFs.setDirectoryPermission({ directory: '/perm-test', principal: 'reader', permission: 'read' });
      await caskFs.setUserRole({ user: 'carol', role: 'reader' });

      const canRead = await caskFs.testPermission({
        user: 'carol', filePath: '/perm-test/file.txt', permission: 'read', isFile: true
      });
      assert.strictEqual(canRead, true);

      const canWrite = await caskFs.testPermission({
        user: 'carol', filePath: '/perm-test/file.txt', permission: 'write', isFile: true
      });
      assert.strictEqual(canWrite, false);
    });

    it('testPermission evaluates a direct user grant (no role involved)', async () => {
      await caskFs.write({ filePath: '/perm-test-direct/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
      await caskFs.setDirectoryPermission({
        directory: '/perm-test-direct', principal: 'frank', principalType: 'user', permission: 'read'
      });

      const canRead = await caskFs.testPermission({
        user: 'frank', filePath: '/perm-test-direct/file.txt', permission: 'read', isFile: true
      });
      assert.strictEqual(canRead, true);

      const canWrite = await caskFs.testPermission({
        user: 'frank', filePath: '/perm-test-direct/file.txt', permission: 'write', isFile: true
      });
      assert.strictEqual(canWrite, false);
    });
  });

  describe('when ACL is enabled', () => {
    let caskFs;

    before(async () => {
      aclImpl.enabled = true;
      caskFs = await setup();
      // Bootstrap an admin directly via the library (the wrappers under test
      // require admin access to call, so we can't use them to create the first admin).
      await aclImpl.ensureUserRole({ user: 'admin-user', role: 'admin', dbClient: caskFs.dbClient });
    });

    after(async () => {
      aclImpl.enabled = false;
      await teardown();
    });

    const NON_ADMIN_CALLS = {
      ensureUser: () => caskFs.ensureUser({ requestor: 'nobody', user: 'x' }),
      removeUser: () => caskFs.removeUser({ requestor: 'nobody', user: 'x' }),
      ensureRole: () => caskFs.ensureRole({ requestor: 'nobody', role: 'x' }),
      removeRole: () => caskFs.removeRole({ requestor: 'nobody', role: 'x' }),
      setUserRole: () => caskFs.setUserRole({ requestor: 'nobody', user: 'x', role: 'y' }),
      removeUserRole: () => caskFs.removeUserRole({ requestor: 'nobody', user: 'x', role: 'y' }),
      getUserRoles: () => caskFs.getUserRoles({ requestor: 'nobody', user: 'x' }),
      getRole: () => caskFs.getRole({ requestor: 'nobody', role: 'x' }),
      getRoles: () => caskFs.getRoles({ requestor: 'nobody' }),
      getUsers: () => caskFs.getUsers({ requestor: 'nobody' }),
      'getRoles with search/limit': () => caskFs.getRoles({ requestor: 'nobody', search: 'x', limit: 5 }),
      'getUsers with search/limit': () => caskFs.getUsers({ requestor: 'nobody', search: 'x', limit: 5 }),
      testPermission: () => caskFs.testPermission({ requestor: 'nobody', user: 'x', filePath: '/', permission: 'read' }),
      rotateAuditLog: () => caskFs.rotateAuditLog({ requestor: 'nobody', dryRun: true }),
      listAuditArchives: () => caskFs.listAuditArchives({ requestor: 'nobody' }),
      getAuditArchive: () => caskFs.getAuditArchive({ requestor: 'nobody', name: 'audit_log_2026_01.jsonl.gz' }),
      deleteAuditArchive: () => caskFs.deleteAuditArchive({ requestor: 'nobody', name: 'audit_log_2026_01.jsonl.gz' }),
    };

    for (const [name, call] of Object.entries(NON_ADMIN_CALLS)) {
      it(`${name}() rejects a non-admin requestor (regression: allowAdminAction used to never enforce)`, async () => {
        await assert.rejects(call, { name: 'AclAccessError' });
      });
    }

    it('getUserRoles allows a non-admin requestor to look up their own roles', async () => {
      await aclImpl.ensureUserRole({ user: 'self-lookup-user', role: 'reader', dbClient: caskFs.dbClient });

      const roles = await caskFs.getUserRoles({ requestor: 'self-lookup-user', user: 'self-lookup-user' });
      assert.ok(roles.roles.includes('reader'));
    });

    it('allows the full admin flow for an actual admin requestor', async () => {
      await caskFs.ensureUser({ requestor: 'admin-user', user: 'dave' });
      await caskFs.setUserRole({ requestor: 'admin-user', user: 'dave', role: 'billing' });

      assert.ok((await caskFs.getUserRoles({ requestor: 'admin-user', user: 'dave' })).roles.includes('billing'));
      assert.ok((await caskFs.getRoles({ requestor: 'admin-user' })).roles.some(r => r.role === 'billing'));
      assert.ok((await caskFs.getUsers({ requestor: 'admin-user' })).users.some(u => u.user === 'dave'));

      await caskFs.removeUserRole({ requestor: 'admin-user', user: 'dave', role: 'billing' });
      assert.ok(!(await caskFs.getUserRoles({ requestor: 'admin-user', user: 'dave' })).roles.includes('billing'));

      await caskFs.removeUser({ requestor: 'admin-user', user: 'dave' });
      await caskFs.removeRole({ requestor: 'admin-user', role: 'billing' });
    });
  });
});
