import { Command } from 'commander';
import CaskFs from '../index.js';
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import cliProgress from 'cli-progress';
import path from 'path';
import os from 'os';
import config from '../lib/config.js';

const program = new Command();
optsWrapper(program);

program
  .command('write-all-metadata')
  .description('Rewrite metadata for all files in the CaskFS')
  .action(async () => {
    handleGlobalOpts({});
    const caskfs = new CaskFs();

    let pbar;

    await caskfs.rewriteAllMetadataFiles((progress) => {
      if( !pbar ) {
        pbar = new cliProgress.Bar(
          {etaBuffer: 50}, 
          cliProgress.Presets.shades_classic
        ); 
        pbar.start(progress.total, 0);
      }
      pbar.update(progress.count);
    });

    pbar.stop();
    caskfs.dbClient.end();
  });

program
  .command('stats')
  .description('Get statistics about the CaskFS')
  .action(async () => {
    handleGlobalOpts({});
    const caskfs = new CaskFs();
    console.log(await caskfs.stats());
    caskfs.dbClient.end();
  });

program
  .command('delete-unused-hashes')
  .description('Delete unused hashes from the CaskFS')
  .option('-l, --hash-list <hashes>', 'Comma-separated list of hash values to delete', (val) => val.split(','))
  .action(async (options) => {
    handleGlobalOpts(options);
    const caskfs = new CaskFs();

    if( options.hashList && options.hashList.length > 0 ) {
      console.log(`Deleting ${options.hashList.length} specified hashes...`);
      await caskfs.cas.deleteUnusedHashes({ hashList: options.hashList });
    } else {

      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.warn(`\nYou are about to delete ALL unused hashes from the CaskFS. This will permanently delete any files that are not currently referenced by any metadata. This action is irreversible!\n`);

      const confirm = await new Promise(resolve => {
        rl.question('Are you sure you want to continue? (yes/no): ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });

      if (confirm !== 'yes') {
        console.log('Delete aborted.');
        process.exit(0);
      }

      console.log(`Deleting all unused hashes...`);
      let deletedCount = 0;
      while( true ) {
        let batchDeleted = await caskfs.cas.deleteUnusedHashes({ limit: 100 });
        if( batchDeleted.length === 0 ) {
          break;
        }
        deletedCount += batchDeleted.length;
        console.log(`Deleted ${batchDeleted.length} unused hashes, total deleted: ${deletedCount}`);
      }
    }

    caskfs.dbClient.end();
  });

program
  .command('unused-hash-count')
  .description('Count unused hashes in the CaskFS')
  .action(async () => {
    handleGlobalOpts({});
    const caskfs = new CaskFs();
    console.log(await caskfs.cas.getUnusedHashCount());
    caskfs.dbClient.end();
  });

program
  .command('powerwash')
  .description('Power wash the CaskFS - WARNING: This will delete ALL data and metadata!')
  .option('-a, --include-admin', 'Set current user to admin role', false)
  .option('-r, --user-roles-file <user-roles-file>', 'Path to a JSON or YAML file containing user roles to initialize after powerwash')
  .action(async (options) => {
    handleGlobalOpts(options);

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let dir = path.resolve(config.rootDir);
    console.warn(`\n**** WARNING ****
* This will delete ALL data and metadata in the CaskFs root directory: ${dir}
* This action is irreversible!
*****************\n`);

    const confirm = await new Promise(resolve => {
      rl.question('Are you sure you want to continue? (yes/no): ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });

    if (confirm !== 'yes') {
      console.log('Powerwash aborted.');
      process.exit(0);
    }

    const cask = new CaskFs();
    await cask.powerWash();

    if( options.includeAdmin ) {
      let user = os.userInfo().username;
      console.log(`Setting user ${user} to have admin role`);
      await cask.setUserRole({ user, role: config.acl.adminRole });
    }

    if( options.userRolesFile ) {
      console.log(`Loading user roles from ${options.userRolesFile}`);
      let userRoles = JSON.parse(await fs.readFile(options.userRolesFile, 'utf-8'));
      await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    }

    cask.dbClient.end();
  });

program.parse(process.argv);