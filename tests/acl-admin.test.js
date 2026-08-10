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
      assert.ok(userRoles.includes('editor'));

      const roleUsers = await caskFs.getRole({ role: 'editor' });
      assert.ok(roleUsers.some(r => r.user === 'alice'));

      const roles = await caskFs.getRoles();
      assert.ok(roles.some(r => r.role === 'editor'));
    });

    it('removeUserRole actually removes the association (regression: used to always throw)', async () => {
      await caskFs.setUserRole({ user: 'bob', role: 'viewer' });
      assert.ok((await caskFs.getUserRoles({ user: 'bob' })).includes('viewer'));

      await caskFs.removeUserRole({ user: 'bob', role: 'viewer' });

      assert.ok(!(await caskFs.getUserRoles({ user: 'bob' })).includes('viewer'));
    });

    it('testPermission evaluates a directory permission for a given user', async () => {
      await caskFs.write({ filePath: '/perm-test/file.txt', data: Buffer.from('x'), requestor: 'setup', ignoreAcl: true });
      await caskFs.setDirectoryPermission({ directory: '/perm-test', role: 'reader', permission: 'read' });
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
      testPermission: () => caskFs.testPermission({ requestor: 'nobody', user: 'x', filePath: '/', permission: 'read' }),
    };

    for (const [name, call] of Object.entries(NON_ADMIN_CALLS)) {
      it(`${name}() rejects a non-admin requestor (regression: allowAdminAction used to never enforce)`, async () => {
        await assert.rejects(call, { name: 'AclAccessError' });
      });
    }

    it('getUserRoles allows a non-admin requestor to look up their own roles', async () => {
      await aclImpl.ensureUserRole({ user: 'self-lookup-user', role: 'reader', dbClient: caskFs.dbClient });

      const roles = await caskFs.getUserRoles({ requestor: 'self-lookup-user', user: 'self-lookup-user' });
      assert.ok(roles.includes('reader'));
    });

    it('allows the full admin flow for an actual admin requestor', async () => {
      await caskFs.ensureUser({ requestor: 'admin-user', user: 'dave' });
      await caskFs.setUserRole({ requestor: 'admin-user', user: 'dave', role: 'billing' });

      assert.ok((await caskFs.getUserRoles({ requestor: 'admin-user', user: 'dave' })).includes('billing'));
      assert.ok((await caskFs.getRoles({ requestor: 'admin-user' })).some(r => r.role === 'billing'));

      await caskFs.removeUserRole({ requestor: 'admin-user', user: 'dave', role: 'billing' });
      assert.ok(!(await caskFs.getUserRoles({ requestor: 'admin-user', user: 'dave' })).includes('billing'));

      await caskFs.removeUser({ requestor: 'admin-user', user: 'dave' });
      await caskFs.removeRole({ requestor: 'admin-user', role: 'billing' });
    });
  });
});
