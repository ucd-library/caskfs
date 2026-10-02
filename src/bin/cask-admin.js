import { Command } from 'commander';
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import { getClient, endClient, assertDirectPg } from './lib/client.js';
import path from 'path';
import os from 'os';
import config from '../lib/config.js';

const program = new Command();
optsWrapper(program);

program
  .command('stats')
  .description('Get statistics about the CaskFS')
  .action(async (options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    console.log(await cask.stats());
    await endClient(cask);
  });

program
  .command('delete-unused-hashes')
  .description('Delete unused hashes from the CaskFS')
  .option('-l, --hash-list <hashes>', 'Comma-separated list of hash values to delete', (val) => val.split(','))
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'admin delete-unused-hashes');

    if( options.hashList && options.hashList.length > 0 ) {
      console.log(`Deleting ${options.hashList.length} specified hashes...`);
      await cask.cas.deleteUnusedHashes({ hashList: options.hashList });
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
        let batchDeleted = await cask.cas.deleteUnusedHashes({ limit: 100 });
        if( batchDeleted.length === 0 ) {
          break;
        }
        deletedCount += batchDeleted.length;
        console.log(`Deleted ${batchDeleted.length} unused hashes, total deleted: ${deletedCount}`);
      }
    }

    await endClient(cask);
  });

program
  .command('unused-hash-count')
  .description('Count unused hashes in the CaskFS')
  .action(async (options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'admin unused-hash-count');
    console.log(await cask.cas.getUnusedHashCount());
    await endClient(cask);
  });

program
  .command('cleanup-ld')
  .description('Delete unused ld_filter/ld_link/ld_literal rows and now-orphaned uri rows')
  .option('-n, --dry-run', 'Show what would be deleted without deleting anything', false)
  .option('-y, --yes', 'Skip the confirmation prompt', false)
  .option('-b, --batch-size <n>', 'Number of rows to delete per batch', (val) => parseInt(val), 100)
  .option('-t, --statement-timeout <seconds>', 'lock_timeout/statement_timeout (seconds) for each delete batch', (val) => parseInt(val), 120)
  .option('--vacuum-full', 'Run VACUUM FULL on affected tables after cleanup', false)
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'admin cleanup-ld');

    if (options.dryRun) {
      const overview = await cask.rdf.getUnusedLdOverview();
      console.log('Unused linked-data overview (approximate - counts may change before you confirm):');
      console.log(`  ld_filter:  ${overview.ldFilter}`);
      console.log(`  ld_link:    ${overview.ldLink}`);
      console.log(`  ld_literal: ${overview.ldLiteral}`);
      console.log(`  uri (projected, after the rows above are removed): ${overview.uri}`);
      await endClient(cask);
      return;
    }

    if (!options.yes) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.warn(`\nYou are about to permanently delete all currently-unused ld_filter/ld_link/ld_literal and now-orphaned uri rows from the CaskFS. This action is irreversible! Run with --dry-run first if you want to see counts before confirming.\n`);

      const confirm = await new Promise(resolve => {
        rl.question('Are you sure you want to continue? (yes/no): ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });

      if (confirm !== 'yes') {
        console.log('Cleanup aborted.');
        process.exit(0);
      }
    }

    console.log('Cleaning up unused linked-data entries...');
    const result = await cask.rdf.cleanupUnusedLd({ batchSize: options.batchSize, statementTimeout: options.statementTimeout });
    console.log(`Deleted ${result.ldFilterDeleted} ld_filter, ${result.ldLinkDeleted} ld_link, ${result.ldLiteralDeleted} ld_literal, ${result.uriDeleted} uri rows.`);

    if (options.vacuumFull) {
      console.log('Running VACUUM FULL on affected tables (each table is briefly fully locked for reads and writes)...');
      await cask.rdf.vacuumLdTables();
      console.log('Vacuum complete.');
    }

    await endClient(cask);
  });

program
  .command('powerwash')
  .description('Power wash the CaskFS - WARNING: This will delete ALL data and metadata!')
  .option('-a, --include-admin', 'Set current user to admin role', false)
  .option('-r, --user-roles-file <user-roles-file>', 'Path to a JSON or YAML file containing user roles to initialize after powerwash')
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'admin powerwash');

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

    await cask.powerWash();

    if( options.includeAdmin ) {
      let user = os.userInfo().username;
      console.log(`Setting user ${user} to have admin role`);
      await cask.setUserRole({ user, role: config.acl.adminRole });
    }

    if( options.userRolesFile ) {
      const fs = await import('fs/promises');
      console.log(`Loading user roles from ${options.userRolesFile}`);
      let userRoles = JSON.parse(await fs.default.readFile(options.userRolesFile, 'utf-8'));
      await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    }

    await endClient(cask);
  });

program.parse(process.argv);
