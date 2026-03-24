#! /usr/bin/env -S node

import { Command } from 'commander';
import path from 'path';
import cliProgress from 'cli-progress';
import CaskFs from '../index.js';
import { optsWrapper, handleGlobalOpts } from './opts-wrapper.js';
import fs from 'fs';

const program = new Command();
optsWrapper(program);

program
  .command('export <root-dir> [file]')
  .description('Export files under a CaskFS path to a .tar.gz archive')
  .option('-a, --include-acl', 'include ACL roles, users, and permissions in the archive', false)
  .option('-p, --include-auto-partition', 'include auto-partition and auto-bucket rules in the archive', false)
  .action(async (rootDir, file, options) => {
    handleGlobalOpts(options);

    if (!file) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      file = `caskfs-export-${ts}.tar.gz`;
    }

    if (!path.isAbsolute(file)) {
      file = path.resolve(process.cwd(), file);
    }

    if( fs.statSync(file).isDirectory() ) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      file = path.join(file, `caskfs-export-${ts}.tar.gz`);
    }

    if( !file.endsWith('.tar.gz') ) {
      file += '.tar.gz';
    }

    const cask = new CaskFs();

    let pbar;
    const cb = ({ type, current, total }) => {
      if (type !== 'cas') return;
      if (!pbar) {
        pbar = new cliProgress.Bar({ etaBuffer: 50 }, cliProgress.Presets.shades_classic);
        pbar.start(total, 0);
      }
      pbar.update(current);
    };

    const summary = await cask.export(file, {
      rootDir,
      includeAcl: options.includeAcl,
      includeAutoPartition: options.includeAutoPartition,
      cb,
    });

    if (pbar) pbar.stop();

    console.log(`\nExported to: ${file}`);
    console.log(`  hashes : ${summary.hashCount}`);
    console.log(`  files  : ${summary.fileCount}`);

    cask.close();
  });

program
  .command('import <file>')
  .description('Import a .tar.gz archive produced by the export command')
  .option('-o, --overwrite', 'overwrite existing file records on path conflict (default: fail)', false)
  .option('--acl-conflict <mode>', "ACL conflict mode: 'fail', 'skip', or 'merge' (default: fail)", 'fail')
  .option('--auto-partition-conflict <mode>', "auto-partition conflict mode: 'fail', 'skip', or 'merge' (default: fail)", 'fail')
  .action(async (file, options) => {
    handleGlobalOpts(options);

    if (!path.isAbsolute(file)) {
      file = path.resolve(process.cwd(), file);
    }

    const cask = new CaskFs();

    let pbar;
    const cb = ({ type, current, total }) => {
      if (type !== 'cas') return;
      if (!pbar) {
        pbar = new cliProgress.Bar({ etaBuffer: 50 }, cliProgress.Presets.shades_classic);
        pbar.start(total, 0);
      }
      pbar.update(current);
    };

    const summary = await cask.import(file, {
      overwrite: options.overwrite,
      aclConflict: options.aclConflict,
      autoPartitionConflict: options.autoPartitionConflict,
      cb,
    });

    if (pbar) pbar.stop();

    console.log(`\nImported from: ${file}`);
    console.log(`  hashes imported : ${summary.hashCount}`);
    console.log(`  files imported  : ${summary.fileCount}`);
    console.log(`  files skipped   : ${summary.skippedFiles}`);

    cask.close();
  });

program.parse(process.argv);
