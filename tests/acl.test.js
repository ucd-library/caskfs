import assert from 'assert';
import { setup, teardown } from './helpers/setup.js';
import aclImpl from '../src/lib/acl.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fully-wired CaskFs instance with ACL enabled, seed a directory tree,
 * create users+roles, and set permissions.  Returns everything needed by tests.
 *
 * @param {Object} opts
 * @param {String}  opts.directory       - the directory to protect
 * @param {String}  opts.role            - role name to create
 * @param {String}  opts.user            - user to put in that role
 * @param {String}  opts.permission      - 'read' | 'write'
 * @param {Array}   [opts.seedFiles]     - [{filePath, data}] written with ignoreAcl:true
 */
async function aclSetup(opts={}) {
  aclImpl.enabled = true;

  const caskFs = await setup();

  // Write seed files without ACL so we always start from a known state
  for (const f of (opts.seedFiles || [])) {
    await caskFs.write({
      filePath: f.filePath,
      data: Buffer.from(f.data ?? 'seed'),
      requestor: 'admin',
      ignoreAcl: true,
    });
  }

  // Create the directory if it has no files yet (mkdir is idempotent)
  // if (opts.directory) {
  //   await caskFs.directory.mkdir(opts.directory, { dbClient: caskFs.dbClient });
  // }

  // Wire up user → role → permission
  if (opts.role && opts.user) {
    await aclImpl.ensureUserRole({
      user: opts.user,
      role: opts.role,
      dbClient: caskFs.dbClient,
    });
  }

  if (opts.directory && opts.role && opts.permission) {
    await caskFs.setDirectoryPermission({
      directory: opts.directory,
      role: opts.role,
      permission: opts.permission,
      ignoreAcl: true,
    });
  }

  return caskFs;
}

async function aclTeardown() {
  aclImpl.enabled = false;
  await teardown();
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('ACL', () => {

  // ── 1. No ACL on directory ─────────────────────────────────────────────────

  describe('no ACL set — access denied', () => {
    let caskFs;

    before(async () => {
      aclImpl.enabled = true;
      caskFs = await setup();
      // Write a file without ACL, but set NO permissions on the directory
      await caskFs.write({
        filePath: '/locked/file.txt',
        data: Buffer.from('secret'),
        requestor: 'admin',
        ignoreAcl: true,
      });
    });

    after(aclTeardown);

    it('ls() should throw AclAccessError when no permissions are set', async () => {
      await assert.rejects(
        () => caskFs.ls({ directory: '/locked', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );
    });

    it('read() should throw AclAccessError when no permissions are set', async () => {
      await assert.rejects(
        () => caskFs.read({ filePath: '/locked/file.txt', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );
    });

    it('write() should throw AclAccessError when no permissions are set', async () => {
      await assert.rejects(
        () => caskFs.write({
          filePath: '/locked/new.txt',
          data: Buffer.from('x'),
          requestor: 'alice',
        }),
        { name: 'AclAccessError' }
      );
    });

    it('deleteFile() should throw AclAccessError when no permissions are set', async () => {
      await assert.rejects(
        () => caskFs.deleteFile({ filePath: '/locked/file.txt', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );
    });
  });

  // ── 2. read permission ─────────────────────────────────────────────────────

  describe('read permission', () => {
    let caskFs;

    before(async () => {
      caskFs = await aclSetup({
        directory: '/readable',
        role: 'readers',
        user: 'alice',
        permission: 'read',
        seedFiles: [{ filePath: '/readable/doc.txt', data: 'hello' }],
      });
    });

    after(aclTeardown);

    it('ls() should succeed for a user with read permission', async () => {
      const result = await caskFs.ls({ directory: '/readable', requestor: 'alice' });
      assert.ok(result.files.some(f => f.filename === 'doc.txt'));
    });

    it('read() should succeed for a user with read permission', async () => {
      const buf = await caskFs.read({ filePath: '/readable/doc.txt', requestor: 'alice' });
      assert.strictEqual(buf.toString(), 'hello');
    });

    it('ls() should throw for a user NOT in the role', async () => {
      await assert.rejects(
        () => caskFs.ls({ directory: '/readable', requestor: 'bob' }),
        { name: 'AclAccessError' }
      );
    });

    it('read() should throw for a user NOT in the role', async () => {
      await assert.rejects(
        () => caskFs.read({ filePath: '/readable/doc.txt', requestor: 'bob' }),
        { name: 'AclAccessError' }
      );
    });

    it('read permission alone should NOT allow deleteFile()', async () => {
      await assert.rejects(
        () => caskFs.deleteFile({ filePath: '/readable/doc.txt', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );
    });
  });

  // ── 3. write permission ────────────────────────────────────────────────────
  //
  // write() and deleteFile() both call metadata() internally, which requires
  // read permission to resolve the file's directory ACL. So in practice a
  // user needs read + write to create or delete files.  These tests grant
  // alice both permissions and verify that read-only users are blocked from
  // destructive operations.

  describe('write permission', () => {
    let caskFs;

    before(async () => {
      caskFs = await aclSetup({
        directory: '/writable',
        role: 'writers',
        user: 'alice',
        permission: 'write',
        seedFiles: [{ filePath: '/writable/draft.txt', data: 'draft' }],
      });

      // write() and deleteFile() require read as well as write because they
      // call metadata() internally — grant alice read too.
      await caskFs.setDirectoryPermission({
        directory: '/writable',
        role: 'writers',
        permission: 'read',
        ignoreAcl: true,
      });

      // charlie has read only — used to verify read-only blocks destructive ops
      await aclImpl.ensureUserRole({
        user: 'charlie',
        role: 'readers',
        dbClient: caskFs.dbClient,
      });
      await caskFs.setDirectoryPermission({
        directory: '/writable',
        role: 'readers',
        permission: 'read',
        ignoreAcl: true,
      });
    });

    after(aclTeardown);

    it('write() should succeed for a user with read + write permission', async () => {
      const ctx = await caskFs.write({
        filePath: '/writable/new.txt',
        data: Buffer.from('new content'),
        requestor: 'alice',
      });
      assert.ok(!ctx.data.error, `write should not error: ${ctx.data.error?.message}`);
    });

    it('deleteFile() should succeed for a user with read + write permission', async () => {
      await caskFs.write({
        filePath: '/writable/to-delete.txt',
        data: Buffer.from('bye'),
        requestor: 'alice',
      });
      await caskFs.deleteFile({ filePath: '/writable/to-delete.txt', requestor: 'alice' });

      const exists = await caskFs.exists({
        filePath: '/writable/to-delete.txt',
        ignoreAcl: true,
      });
      assert.strictEqual(exists, false);
    });

    it('write() should throw for a user with no permissions', async () => {
      await assert.rejects(
        () => caskFs.write({
          filePath: '/writable/unauthorized.txt',
          data: Buffer.from('nope'),
          requestor: 'bob',
        }),
        { name: 'AclAccessError' }
      );
    });

    it('deleteFile() should throw for a user with no permissions', async () => {
      await assert.rejects(
        () => caskFs.deleteFile({ filePath: '/writable/draft.txt', requestor: 'bob' }),
        { name: 'AclAccessError' }
      );
    });

    it('deleteFile() should throw for a read-only user', async () => {
      await assert.rejects(
        () => caskFs.deleteFile({ filePath: '/writable/draft.txt', requestor: 'charlie' }),
        { name: 'AclAccessError' }
      );
    });
  });

  // ── 4. Inheritance ─────────────────────────────────────────────────────────

  describe('ACL inheritance — child inherits parent permissions', () => {
    let caskFs;

    before(async () => {
      caskFs = await aclSetup({
        directory: '/parent',
        role: 'family',
        user: 'alice',
        permission: 'read',
        seedFiles: [
          { filePath: '/parent/top.txt',         data: 'top' },
          { filePath: '/parent/child/nested.txt', data: 'nested' },
        ],
      });
    });

    after(aclTeardown);

    it('user can ls() the parent directory', async () => {
      const result = await caskFs.ls({ directory: '/parent', requestor: 'alice' });
      assert.ok(result.files.some(f => f.filename === 'top.txt'));
    });

    it('user can ls() a child directory without an explicit ACL', async () => {
      const result = await caskFs.ls({ directory: '/parent/child', requestor: 'alice' });
      assert.ok(result.files.some(f => f.filename === 'nested.txt'));
    });

    it('user can read() a file in a child directory via inherited permission', async () => {
      const buf = await caskFs.read({ filePath: '/parent/child/nested.txt', requestor: 'alice' });
      assert.strictEqual(buf.toString(), 'nested');
    });

    it('a user NOT in the role is denied on both parent and child', async () => {
      await assert.rejects(
        () => caskFs.ls({ directory: '/parent', requestor: 'bob' }),
        { name: 'AclAccessError' }
      );
      await assert.rejects(
        () => caskFs.ls({ directory: '/parent/child', requestor: 'bob' }),
        { name: 'AclAccessError' }
      );
    });
  });

  // ── 5. Override ────────────────────────────────────────────────────────────

  describe('ACL override — child ACL replaces parent ACL entirely', () => {
    let caskFs;

    before(async () => {
      // Parent: 'readers' role has read permission
      caskFs = await aclSetup({
        directory: '/vault',
        role: 'readers',
        user: 'alice',
        permission: 'read',
        seedFiles: [
          { filePath: '/vault/public.txt',          data: 'public' },
          { filePath: '/vault/secret/private.txt',  data: 'private' },
        ],
      });

      // Child /vault/secret gets its OWN ACL — 'admins' role only.
      // 'readers' (alice) should now be DENIED on /vault/secret even though
      // she can read /vault.
      await caskFs.setDirectoryPermission({
        directory: '/vault/secret',
        role: 'admins',
        permission: 'read',
        ignoreAcl: true,
      });
    });

    after(aclTeardown);

    it('alice (readers) can still read the parent directory', async () => {
      const result = await caskFs.ls({ directory: '/vault', requestor: 'alice' });
      assert.ok(result.files.some(f => f.filename === 'public.txt'));
    });

    it('alice (readers) is denied on the child directory that has its own ACL', async () => {
      await assert.rejects(
        () => caskFs.ls({ directory: '/vault/secret', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );
    });

    it('alice is denied reading a file inside the overridden child directory', async () => {
      await assert.rejects(
        () => caskFs.read({ filePath: '/vault/secret/private.txt', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );
    });

    it('a user in the child-specific role can access the child directory', async () => {
      await aclImpl.ensureUserRole({
        user: 'charlie',
        role: 'admins',
        dbClient: caskFs.dbClient,
      });

      const result = await caskFs.ls({ directory: '/vault/secret', requestor: 'charlie' });
      assert.ok(result.files.some(f => f.filename === 'private.txt'));
    });
  });

  // ── 6. ACL removal ────────────────────────────────────────────────────────

  describe('ACL removal — falls back to nearest ancestor ACL', () => {
    let caskFs;

    before(async () => {
      // grandparent: readers can read
      caskFs = await aclSetup({
        directory: '/grandparent',
        role: 'readers',
        user: 'alice',
        permission: 'read',
        seedFiles: [
          { filePath: '/grandparent/child/grandchild/deep.txt', data: 'deep' },
        ],
      });

      // child gets its own ACL — blocks everyone
      await caskFs.setDirectoryPermission({
        directory: '/grandparent/child',
        role: 'nobody',
        permission: 'read',
        ignoreAcl: true,
      });

      // confirm alice is now blocked on grandchild (inherits child's ACL)
      await assert.rejects(
        () => caskFs.ls({ directory: '/grandparent/child/grandchild', requestor: 'alice' }),
        { name: 'AclAccessError' }
      );

      // now REMOVE the child ACL — grandchild should fall back to grandparent's ACL
      await caskFs.removeDirectoryAcl({
        directory: '/grandparent/child',
        ignoreAcl: true,
      });
    });

    after(aclTeardown);

    it('after ACL removal the grandchild inherits from the grandparent again', async () => {
      const result = await caskFs.ls({
        directory: '/grandparent/child/grandchild',
        requestor: 'alice',
      });
      assert.ok(result.files.some(f => f.filename === 'deep.txt'));
    });

    it('the child directory itself also falls back to grandparent ACL', async () => {
      const result = await caskFs.ls({
        directory: '/grandparent/child',
        requestor: 'alice',
      });
      assert.ok(Array.isArray(result.directories));
    });
  });

  // ── 7. Public directories ─────────────────────────────────────────────────

  describe('public directory — readable without a requestor', () => {
    let caskFs;

    before(async () => {
      aclImpl.enabled = true;
      caskFs = await setup();

      await caskFs.write({
        filePath: '/open/readme.txt',
        data: Buffer.from('public content'),
        requestor: 'admin',
        ignoreAcl: true,
      });

      await caskFs.setDirectoryPublic({
        directory: '/open',
        permission: true,
        ignoreAcl: true,
      });
    });

    after(aclTeardown);

    it('ls() succeeds with no requestor on a public directory', async () => {
      const result = await caskFs.ls({ directory: '/open' });
      assert.ok(result.files.some(f => f.filename === 'readme.txt'));
    });

    it('read() succeeds with no requestor on a file in a public directory', async () => {
      const buf = await caskFs.read({ filePath: '/open/readme.txt' });
      assert.strictEqual(buf.toString(), 'public content');
    });

    it('making a directory private blocks unauthenticated access', async () => {
      await caskFs.setDirectoryPublic({
        directory: '/open',
        permission: false,
        ignoreAcl: true,
      });

      await assert.rejects(
        () => caskFs.ls({ directory: '/open' }),
        { name: 'AclAccessError' }
      );
    });
  });

  // ── 8. Admin bypasses ACL ─────────────────────────────────────────────────

  describe('admin role bypasses all ACL checks', () => {
    let caskFs;

    before(async () => {
      aclImpl.enabled = true;
      caskFs = await setup();

      await caskFs.write({
        filePath: '/restricted/secret.txt',
        data: Buffer.from('classified'),
        requestor: 'setup',
        ignoreAcl: true,
      });

      // Set a permission that only 'other-role' has — admin should bypass this
      await caskFs.setDirectoryPermission({
        directory: '/restricted',
        role: 'other-role',
        permission: 'read',
        ignoreAcl: true,
      });

      // Make alice an admin
      await aclImpl.ensureUserRole({
        user: 'alice',
        role: 'admin',
        dbClient: caskFs.dbClient,
      });
    });

    after(aclTeardown);

    it('admin user can ls() a directory even without an explicit role permission', async () => {
      const result = await caskFs.ls({ directory: '/restricted', requestor: 'alice' });
      assert.ok(result.files.some(f => f.filename === 'secret.txt'));
    });

    it('admin user can read() a file without explicit permission', async () => {
      const buf = await caskFs.read({ filePath: '/restricted/secret.txt', requestor: 'alice' });
      assert.strictEqual(buf.toString(), 'classified');
    });

    it('admin user can deleteFile() without explicit write permission', async () => {
      await caskFs.write({
        filePath: '/restricted/to-remove.txt',
        data: Buffer.from('remove me'),
        requestor: 'setup',
        ignoreAcl: true,
      });

      await caskFs.deleteFile({ filePath: '/restricted/to-remove.txt', requestor: 'alice' });

      const exists = await caskFs.exists({
        filePath: '/restricted/to-remove.txt',
        ignoreAcl: true,
      });
      assert.strictEqual(exists, false);
    });

    it('non-admin user is still denied without an explicit permission', async () => {
      await assert.rejects(
        () => caskFs.ls({ directory: '/restricted', requestor: 'bob' }),
        { name: 'AclAccessError' }
      );
    });
  });

});
