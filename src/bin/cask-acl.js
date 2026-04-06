import { Command } from 'commander';
import { stringify as stringifyYaml } from 'yaml'
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import { getClient, endClient, assertDirectPg } from './lib/client.js';

const program = new Command();
optsWrapper(program);

const PERMISSIONS = ['public', 'read', 'write', 'admin'];

program.command('user-add <username>')
  .description('Add a new user')
  .action(async (username) => {
    const opts = handleGlobalOpts({ user: username });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl user-add');
    await cask.ensureUser(opts);
    await endClient(cask);
  });

program.command('user-remove <username>')
  .description('Remove a user')
  .action(async (username) => {
    const opts = handleGlobalOpts({ user: username });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl user-remove');
    await cask.removeUser(opts);
    await endClient(cask);
  });

program.command('user-role-get')
  .description('Get a users roles or get users with a role')
  .option('-u, --user <username>', 'username to get roles for')
  .option('-r, --role <role>', 'role to get users for')
  .action(async (options) => {
    const { user: username, role } = options;
    if( !username && !role ) {
      throw new Error('Must provide either a username or a role');
    }
    if( role && username ) {
      throw new Error('Must provide either a username or a role, not both');
    }

    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'acl user-role-get');

    const roleOpts = handleGlobalOpts({ role, dbClient: cask.dbClient });
    const userOpts = handleGlobalOpts({ user: username, dbClient: cask.dbClient });

    if( role ) {
      let resp = await cask.acl.getRole(roleOpts);
      console.log(resp.map(r => r.user).join('\n'));
      await endClient(cask);
      return;
    }

    if( username ) {
      let resp = await cask.acl.getUserRoles(userOpts);
      console.log(resp.join('\n'));
      await endClient(cask);
      return;
    }
  });

program.command('user-role-set <username> <role>')
  .description('Set a user role')
  .action(async (username, role) => {
    const opts = handleGlobalOpts({ user: username, role });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl user-role-set');
    await cask.setUserRole(opts);
    await endClient(cask);
  });

program.command('user-role-remove <username> <role>')
  .description('Remove a user role')
  .action(async (username, role) => {
    const opts = handleGlobalOpts({ user: username, role });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl user-role-remove');
    await cask.removeUserRole(opts);
    await endClient(cask);
  });

program.command('role-add <role>')
  .description('Add a new role')
  .action(async (role) => {
    const opts = handleGlobalOpts({ role });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl role-add');
    await cask.ensureRole(opts);
    await endClient(cask);
  });

program.command('role-remove <role>')
  .description('Remove a role')
  .action(async (role) => {
    const opts = handleGlobalOpts({ role });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl role-remove');
    await cask.removeRole(opts);
    await endClient(cask);
  });

program.command('public-set <directory> <permission>')
  .description('Set a directory as public.  Permission should be true or false')
  .action(async (directory, permission, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'acl public-set');

    if( !['true', 'false'].includes(permission) ) {
      throw new Error(`Invalid permission: ${permission}.  Must be one of: true, false`);
    }

    options.permission = permission;
    options.directory = directory;

    await cask.setDirectoryPublic(options);
    await endClient(cask);
  });

program.command('permission-set <directory> <role> <permission>')
  .description('Set a permission for a role on a directory')
  .action(async (directory, role, permission) => {
    const opts = handleGlobalOpts({ directory, role, permission });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl permission-set');
    await cask.setDirectoryPermission(opts);
    await endClient(cask);
  });

program.command('permission-remove <directory> <role> <permission>')
  .description('Remove a permission for a role on a directory')
  .action(async (directory, role, permission) => {
    const opts = handleGlobalOpts({ directory, role, permission });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl permission-remove');
    await cask.removeDirectoryPermission(opts);
    await endClient(cask);
  });

program.command('remove <directory>')
  .description('Remove the ACL for a directory.  This will remove all permissions and any inheritance settings.')
  .action(async (directory) => {
    const opts = handleGlobalOpts({ directory });
    const cask = getClient(opts);
    assertDirectPg(cask, 'acl remove');
    await cask.removeDirectoryAcl(opts);
    await endClient(cask);
  });

program.command('get <path>')
  .description('Get the ACL for a directory')
  .action(async (path, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'acl get');

    let resp = await cask.getDirectoryAcl({
      filePath: path,
      requestor: options.requestor,
    });

    if( !resp ) {
      console.log(`No ACL found for ${path}`);
      await endClient(cask);
      return;
    }

    if( resp.length > 1 ) {
      console.warn(`Warning: multiple ACLs found for ${path}, this should not happen`);
    }
    resp = resp[0];

    resp.permissions = resp.permissions.filter(p => p.role !== null && p.user !== null);

    let pObj = {
      'ACL Directory': resp.root_acl_directory,
      'Public Read Access': resp.public ? 'Yes' : 'No',
      'Role Permissions': resp.permissions
    }

    console.log(stringifyYaml(pObj));
    await endClient(cask);
  });

program.command('test <path> <username> <permission>')
  .description('Test a user\'s access to a file or directory')
  .option('-f, --is-file', 'Indicate that the path is a file', false)
  .option('-x, --no-cache', 'Disable caching for this check', false)
  .option('-b, --no-admin-bypass', 'Do not allow admin users to bypass checks', false)
  .action(async (path, username, permission, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'acl test');

    if( !PERMISSIONS.includes(permission) ) {
      throw new Error(`Invalid permission: ${permission}.  Must be one of: ${PERMISSIONS.join(', ')}`);
    }

    if( !username ) {
      username = null;
    } else if( username.trim().toLowerCase() === 'public' ) {
      username = null;
    }

    await cask.dbClient.connect();
    let hasPermission = await cask.acl.hasPermission({
      dbClient: cask.dbClient,
      requestor: username,
      filePath: path,
      permission,
      isFile: options.isFile
    });
    console.log(hasPermission ? 'true' : 'false');
    await endClient(cask);
  });

program.parse(process.argv);
