import { Command } from 'commander';
import CaskFs from '../index.js';
import { stringify as stringifyYaml } from 'yaml'
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';

const program = new Command();
optsWrapper(program);

const PERMISSIONS = ['public', 'read', 'write', 'admin'];

program.command('user-add <username>')
  .description('Add a new user')
  .action(async (username) => {
    const opts = handleGlobalOpts({ user: username });
    const cask = new CaskFs();
    await cask.ensureUser(opts);
    cask.dbClient.end();
  });

program.command('user-remove <username>')
  .description('Remove a user')
  .action(async (username) => {
    const opts = handleGlobalOpts({ user: username });
    const cask = new CaskFs();
    await cask.removeUser(opts);
    cask.dbClient.end();
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
    const roleOpts = handleGlobalOpts({ role, dbClient: cask.dbClient });
    const userOpts = handleGlobalOpts({ user: username, dbClient: cask.dbClient });

    const cask = new CaskFs();

    if( role ) {
      let resp = await cask.acl.getRole(roleOpts);
      console.log(resp.map(r => r.user).join('\n'));
      cask.dbClient.end();
      return;
    }

    if( username ) {
      let resp = await cask.acl.getUserRoles(userOpts);
      console.log(resp.join('\n'));
      cask.dbClient.end();
      return;
    }
  });

program.command('user-role-set <username> <role>')
  .description('Set a user role')
  .action(async (username, role) => {
    const opts = handleGlobalOpts({ user: username, role });
    const cask = new CaskFs();
    await cask.setUserRole(opts);
    cask.dbClient.end();
  });

program.command('user-role-remove <username> <role>')
  .description('Remove a user role')
  .action(async (username, role) => {
    const opts = handleGlobalOpts({ user: username, role });
    const cask = new CaskFs();
    await cask.removeUserRole(opts);
    cask.dbClient.end();
  });

program.command('role-add <role>')
  .description('Add a new role')
  .action(async (role) => {
    const opts = handleGlobalOpts({ role });
    const cask = new CaskFs();
    await cask.ensureRole(opts);
    cask.dbClient.end();
  });

program.command('role-remove <role>')
  .description('Remove a role')
  .action(async (role) => {
    const opts = handleGlobalOpts({ role });
    const cask = new CaskFs();
    await cask.removeRole(opts);
    cask.dbClient.end();
  });

program.command('public-set <directory> <permission>')
  .description('Set a directory as public.  Permission should be true or false')
  .action(async (directory, permission, options={}) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();
    if( !['true', 'false'].includes(permission) ) {
      throw new Error(`Invalid permission: ${permission}.  Must be one of: true, false`);
    }

    options.permission = permission;
    options.directory = directory;

    await cask.setDirectoryPublic(options);
    cask.dbClient.end();
  });

program.command('permission-set <directory> <role> <permission>')
  .description('Set a permission for a role on a directory')
  .action(async (directory, role, permission) => {
    const opts = handleGlobalOpts({ directory, role, permission });
    const cask = new CaskFs();
    await cask.setDirectoryPermission(opts);
    cask.dbClient.end();
  });

program.command('permission-remove <directory> <role> <permission>')
  .description('Remove a permission for a role on a directory')
  .action(async (directory, role, permission) => {
    const opts = handleGlobalOpts({ directory, role, permission });
    const cask = new CaskFs();
    await cask.removeDirectoryPermission(opts);
    cask.dbClient.end();
  });

program.command('remove <directory>')
  .description('Remove the ACL for a directory.  This will remove all permissions and any inheritance settings.')
  .action(async (directory) => {
    const opts = handleGlobalOpts({ directory });
    const cask = new CaskFs();
    await cask.removeDirectoryAcl(opts);
    cask.dbClient.end();
  });

program.command('get <path>')
  .description('Get the ACL for a directory')
  .action(async (path, options={}) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();
    cask.dbClient.connect();
    let resp = await cask.getDirectoryAcl({ 
      filePath: path,
      requestor: options.requestor,
    });

    if( !resp ) {
      console.log(`No ACL found for ${path}`);
      cask.dbClient.end();
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
    cask.dbClient.end();
  });

program.command('test <path> <username> <permission>')
  .description('Test a user\'s access to a file or directory')
  .option('-f, --is-file', 'Indicate that the path is a file', false)
  .option('-x, --no-cache', 'Disable caching for this check', false)
  .option('-b, --no-admin-bypass', 'Do not allow admin users to bypass checks', false)
  .action(async (path, username, permission, options) => {
    handleGlobalOpts(options);
    const cask = new CaskFs();

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
    cask.dbClient.end();
  });

program.parse(process.argv);