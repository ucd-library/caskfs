import { Command } from 'commander';
import { stringify as stringifyYaml } from 'yaml'
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import { getClient, endClient } from './lib/client.js';

const program = new Command();
optsWrapper(program);

const PERMISSIONS = ['read', 'write', 'admin'];

program.command('user-add <username>')
  .description('Add a new user')
  .action(async (username) => {
    const opts = handleGlobalOpts({ user: username });
    const cask = getClient(opts);
    await cask.ensureUser(opts);
    await endClient(cask);
  });

program.command('user-remove <username>')
  .description('Remove a user')
  .action(async (username) => {
    const opts = handleGlobalOpts({ user: username });
    const cask = getClient(opts);
    await cask.removeUser(opts);
    await endClient(cask);
  });

program.command('user-list')
  .description('List all defined users')
  .option('-s, --search <text>', 'filter by a case-insensitive substring match on username')
  .option('-l, --limit <n>', 'max users to return', '1000')
  .option('-o, --offset <n>', 'users to skip', '0')
  .action(async (options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    let resp = await cask.getUsers(options);
    console.log(resp.users.map(u => u.user).join('\n'));
    if( resp.total > resp.users.length + Number(options.offset) ) {
      console.log(`\n(showing ${resp.users.length} of ${resp.total} - use --offset to page)`);
    }
    await endClient(cask);
  });

program.command('user-role-get')
  .description('Get a users roles or get users with a role')
  .option('-u, --user <username>', 'username to get roles for')
  .option('-r, --role <role>', 'role to get users for')
  .option('-s, --search <text>', 'filter by a case-insensitive substring match')
  .option('-l, --limit <n>', 'max rows to return', '1000')
  .option('-o, --offset <n>', 'rows to skip', '0')
  .action(async (options) => {
    const { user: username, role, search, limit, offset } = options;
    if( !username && !role ) {
      throw new Error('Must provide either a username or a role');
    }
    if( role && username ) {
      throw new Error('Must provide either a username or a role, not both');
    }

    handleGlobalOpts(options);
    const cask = getClient(options);

    if( role ) {
      let resp = await cask.getRole(handleGlobalOpts({ role, search, limit, offset }));
      console.log(resp.users.map(r => r.user).join('\n'));
      await endClient(cask);
      return;
    }

    if( username ) {
      let resp = await cask.getUserRoles(handleGlobalOpts({ user: username, search, limit, offset }));
      console.log(resp.roles.join('\n'));
      await endClient(cask);
      return;
    }
  });

program.command('user-role-set <username> <role>')
  .description('Set a user role')
  .action(async (username, role) => {
    const opts = handleGlobalOpts({ user: username, role });
    const cask = getClient(opts);
    await cask.setUserRole(opts);
    await endClient(cask);
  });

program.command('user-role-remove <username> <role>')
  .description('Remove a user role')
  .action(async (username, role) => {
    const opts = handleGlobalOpts({ user: username, role });
    const cask = getClient(opts);
    await cask.removeUserRole(opts);
    await endClient(cask);
  });

program.command('role-add <role>')
  .description('Add a new role')
  .action(async (role) => {
    const opts = handleGlobalOpts({ role });
    const cask = getClient(opts);
    await cask.ensureRole(opts);
    await endClient(cask);
  });

program.command('role-remove <role>')
  .description('Remove a role')
  .action(async (role) => {
    const opts = handleGlobalOpts({ role });
    const cask = getClient(opts);
    await cask.removeRole(opts);
    await endClient(cask);
  });

program.command('role-list')
  .description('List all defined roles')
  .option('-s, --search <text>', 'filter by a case-insensitive substring match on role name')
  .option('-l, --limit <n>', 'max roles to return', '1000')
  .option('-o, --offset <n>', 'roles to skip', '0')
  .action(async (options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    let resp = await cask.getRoles(options);
    console.log(resp.roles.map(r => r.role).join('\n'));
    if( resp.total > resp.roles.length + Number(options.offset) ) {
      console.log(`\n(showing ${resp.roles.length} of ${resp.total} - use --offset to page)`);
    }
    await endClient(cask);
  });

program.command('public-set <directory> <permission>')
  .description('Set a directory as public.  Permission should be true or false')
  .action(async (directory, permission, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if( !['true', 'false'].includes(permission) ) {
      throw new Error(`Invalid permission: ${permission}.  Must be one of: true, false`);
    }

    options.permission = permission;
    options.directory = directory;

    await cask.setDirectoryPublic(options);
    await endClient(cask);
  });

program.command('permission-set <directory> <principal> <permission>')
  .description('Grant a permission to a role or user on a directory')
  .option('-t, --type <role|user>', 'principal type: role or user', 'role')
  .action(async (directory, principal, permission, options={}) => {
    if( !['role', 'user'].includes(options.type) ) {
      throw new Error(`Invalid type: ${options.type}.  Must be one of: role, user`);
    }

    const opts = handleGlobalOpts({ directory, principal, principalType: options.type, permission });
    const cask = getClient(opts);
    await cask.setDirectoryPermission(opts);
    await endClient(cask);
  });

program.command('permission-remove <directory> <principal> <permission>')
  .description('Remove a permission for a role or user on a directory')
  .option('-t, --type <role|user>', 'principal type: role or user', 'role')
  .action(async (directory, principal, permission, options={}) => {
    if( !['role', 'user'].includes(options.type) ) {
      throw new Error(`Invalid type: ${options.type}.  Must be one of: role, user`);
    }

    const opts = handleGlobalOpts({ directory, principal, principalType: options.type, permission });
    const cask = getClient(opts);
    await cask.removeDirectoryPermission(opts);
    await endClient(cask);
  });

program.command('remove <directory>')
  .description('Remove the ACL for a directory.  This will remove all permissions and any inheritance settings.')
  .action(async (directory) => {
    const opts = handleGlobalOpts({ directory });
    const cask = getClient(opts);
    await cask.removeDirectoryAcl(opts);
    await endClient(cask);
  });

program.command('get <path>')
  .description('Get the ACL for a directory')
  .action(async (path, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

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

    resp.permissions = resp.permissions.filter(p => p.principalName !== null && p.permission !== null);

    let pObj = {
      'ACL Directory': resp.root_acl_directory,
      'Public Read Access': resp.public ? 'Yes' : 'No',
      'Permissions': resp.permissions
    }

    console.log(stringifyYaml(pObj));
    await endClient(cask);
  });

program.command('test <path> <username> <permission>')
  .description('Test a user\'s access to a file or directory')
  .option('-f, --is-file', 'Indicate that the path is a file', false)
  .action(async (path, username, permission, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if( !PERMISSIONS.includes(permission) ) {
      throw new Error(`Invalid permission: ${permission}.  Must be one of: ${PERMISSIONS.join(', ')}`);
    }

    if( !username ) {
      username = null;
    } else if( username.trim().toLowerCase() === 'public' ) {
      username = null;
    }

    let hasPermission = await cask.testPermission({
      requestor: options.requestor,
      user: username,
      filePath: path,
      permission,
      isFile: options.isFile
    });
    console.log(hasPermission ? 'true' : 'false');
    await endClient(cask);
  });

program.parse(process.argv);
