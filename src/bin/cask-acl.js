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

program.command('set-public <directory> <permission>')
  .description('Set a directory as public')
  .action(async (directory, permission) => {
    const cask = new CaskFs();
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

program.command('remove-acl <directory>')
  .description('Remove the ACL for a directory.  This will remove all permissions and any inheritance settings.')
  .action(async (directory) => {
    const cask = new CaskFs();
    await cask.removeDirectoryAcl({ directory });
    cask.dbClient.end();
  });

program.command('get-acl <path>')
  .description('Get the ACL for a directory')
  .action(async (path) => {
    const cask = new CaskFs();
    cask.dbClient.connect();
    let resp = await cask.getDirectoryAcl({ directory: path });
    if( resp.length === 0 ) {
      console.log(`No ACL found for ${path}`);
      cask.dbClient.end();
      return;
    }
    if( resp.length >= 1 ) {
      console.warn(`Warning: multiple ACLs found for ${path}, this should not happen`);
      resp = resp[0];
    }

    let pObj = {
      'ACL Directory': resp.root_acl_directory,
      'Public Read Access': resp.public_read ? 'Yes' : 'No',
      'Permissions': resp.permissions
    }

    console.log(stringifyYaml(pObj));
    cask.dbClient.end();
  });

program.command('test <path> <username> <permission>')
  .description('Test a user\'s access to a file or directory')
  .option('-d, --is-directory', 'Indicate that the path is a directory', false)
  .action(async (path, username, permission, options) => {
    const cask = new CaskFs();
    await cask.dbClient.connect();
    let hasPermission = await cask.acl.hasPermission({ 
      dbClient: cask.dbClient,
      user: username, 
      filePath: path, 
      permission, 
      isDirectory: options.isDirectory 
    });
    console.log(hasPermission);
    cask.dbClient.end();
  });

program.parse(process.argv);