import { Command } from 'commander';
import CaskFs from '../index.js';
import { stringify as stringifyYaml } from 'yaml'

const program = new Command();

const PERMISSIONS = ['public', 'read', 'write', 'admin'];

program.command('user-add <username>')
  .description('Add a new user')
  .action(async (username) => {
    const cask = new CaskFs();
    await cask.ensureUser({ user: username });
    cask.dbClient.end();
  });

program.command('user-remove <username>')
  .description('Remove a user')
  .action(async (username) => {
    const cask = new CaskFs();
    await cask.removeUser({ user: username });
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
    const cask = new CaskFs();

    if( role ) {
      let resp = await cask.acl.getRole({ role, dbClient: cask.dbClient });
      console.log(resp.map(r => r.user).join('\n'));
      cask.dbClient.end();
      return;
    }

    if( username ) {
      let resp = await cask.acl.getUserRoles({ user: username, dbClient: cask.dbClient });
      console.log(resp.join('\n'));
      cask.dbClient.end();
      return;
    }
  });

program.command('user-role-set <username> <role>')
  .description('Set a user role')
  .action(async (username, role) => {
    const cask = new CaskFs();
    await cask.setUserRole({ user: username, role });
    cask.dbClient.end();
  });

program.command('user-role-remove <username> <role>')
  .description('Remove a user role')
  .action(async (username, role) => {
    const cask = new CaskFs();
    await cask.removeUserRole({ user: username, role });
    cask.dbClient.end();
  });

program.command('role-add <role>')
  .description('Add a new role')
  .action(async (role) => {
    const cask = new CaskFs();
    await cask.ensureRole({ role });
    cask.dbClient.end();
  });

program.command('role-remove <role>')
  .description('Remove a role')
  .action(async (role) => {
    const cask = new CaskFs();
    await cask.removeRole({ role });
    cask.dbClient.end();
  });

program.command('public-set <directory> <permission>')
  .description('Set a directory as public.  Permission should be true or false')
  .action(async (directory, permission) => {
    const cask = new CaskFs();
    if( !['true', 'false'].includes(permission) ) {
      throw new Error(`Invalid permission: ${permission}.  Must be one of: true, false`);
    }

    await cask.setDirectoryPublic({ directory, permission });
    cask.dbClient.end();
  });

program.command('permission-set <directory> <role> <permission>')
  .description('Set a permission for a role on a directory')
  .action(async (directory, role, permission) => {
    const cask = new CaskFs();
    await cask.setDirectoryPermission({ directory, role, permission });
    cask.dbClient.end();
  });

program.command('permission-remove <directory> <role> <permission>')
  .description('Remove a permission for a role on a directory')
  .action(async (directory, role, permission) => {
    const cask = new CaskFs();
    await cask.removeDirectoryPermission({ directory, role, permission });
    cask.dbClient.end();
  });

program.command('remove <directory>')
  .description('Remove the ACL for a directory.  This will remove all permissions and any inheritance settings.')
  .action(async (directory) => {
    const cask = new CaskFs();
    await cask.removeDirectoryAcl({ directory });
    cask.dbClient.end();
  });

program.command('get <path>')
  .description('Get the ACL for a directory')
  .action(async (path) => {
    const cask = new CaskFs();
    cask.dbClient.connect();
    let resp = await cask.getDirectoryAcl({ directory: path });

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
      user: username, 
      filePath: path, 
      permission, 
      isFile: options.isFile 
    });
    console.log(hasPermission);
    cask.dbClient.end();
  });

program.parse(process.argv);