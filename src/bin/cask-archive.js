#! /usr/bin/env -S node

import { Command } from 'commander';
import path from 'path';
import readline from 'readline';
import { optsWrapper, handleGlobalOpts } from './opts-wrapper.js';
import { getClient, endClient } from './lib/client.js';
import fs from 'fs';

const program = new Command();
optsWrapper(program);

/**
 * @function formatBytes
 * @description Format a byte count as a human-readable string.
 * @param {Number} bytes
 * @returns {String}
 */
function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024)        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * @function formatSpeed
 * @description Format bytes-per-second as a human-readable speed string.
 * @param {Number} bps
 * @returns {String}
 */
function formatSpeed(bps) {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bps / 1024).toFixed(1)} KB/s`;
}

/**
 * @function confirm
 * @description Prompt the user for a yes/no answer and resolve true/false.
 * @param {String} question
 * @returns {Promise<Boolean>}
 */
function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (yes/no): `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

program
  .command('export <root-dir> [file]')
  .description('Export files under a CaskFS path to a .tar.gz archive')
  .option('-a, --include-acl', 'include ACL roles, users, and permissions in the archive', false)
  .option('-p, --include-auto-partition', 'include auto-partition and auto-bucket rules in the archive', false)
  .option('-y, --yes', 'skip confirmation prompt', false)
  .action(async (rootDir, file, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if (!file) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      file = `caskfs-export-${ts}.tar.gz`;
    }

    if (!path.isAbsolute(file)) {
      file = path.resolve(process.cwd(), file);
    }

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      file = path.join(file, `caskfs-export-${ts}.tar.gz`);
    }

    if (!file.endsWith('.tar.gz')) {
      file += '.tar.gz';
    }

    // Preflight: get counts before committing to the export
    let preflight = { hashCount: '?', fileCount: '?', diskSize: null };
    try {
      preflight = await cask.exportPreflight({ rootDir });
    } catch(e) {
      console.log(`Warning: export preflight failed — proceeding without counts (${e.message})`);
    }

    const diskSizeStr = preflight.diskSize != null ? formatBytes(preflight.diskSize) : '?';

    console.log('');
    console.log(`  Source path : cask:${rootDir}`);
    console.log(`  Destination : ${file}`);
    console.log(`  Hashes      : ${preflight.hashCount}`);
    console.log(`  Files       : ${preflight.fileCount}`);
    console.log(`  Disk size   : ${diskSizeStr}`);
    console.log('');

    if (!options.yes) {
      const ok = await confirm('Proceed with export?');
      if (!ok) {
        console.log('Export cancelled.');
        await endClient(cask);
        return;
      }
    }

    // Track bytes written for speed display
    let bytesWritten = 0;
    let startTime    = Date.now();
    let speedTimer   = null;

    const printSpeed = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const speed   = elapsed > 0 ? bytesWritten / elapsed : 0;
      process.stdout.write(`\r  Writing... ${formatSpeed(speed)}   `);
    };

    const cb = ({ type, current }) => {
      if (type !== 'cas') return;
      bytesWritten = current;
      if (!speedTimer) {
        startTime  = Date.now();
        speedTimer = setInterval(printSpeed, 250);
      }
    };

    await cask.transfer.export(file, {
      rootDir,
      includeAcl:           options.includeAcl,
      includeAutoPartition: options.includeAutoPartition,
      cb,
    });

    if (speedTimer) {
      clearInterval(speedTimer);
      printSpeed();
      process.stdout.write('\n');
    }

    const archiveSize = formatBytes(fs.statSync(file).size);

    console.log(`\nExported to: ${file}`);
    console.log(`  hashes       : ${preflight.hashCount}`);
    console.log(`  files        : ${preflight.fileCount}`);
    console.log(`  disk size    : ${diskSizeStr}`);
    console.log(`  archive size : ${archiveSize}`);

    await endClient(cask);
  });

program
  .command('import <file>')
  .description('Import a .tar.gz archive produced by the export command')
  .option('-o, --overwrite', 'overwrite existing file records on path conflict (default: fail)', false)
  .option('--acl-conflict <mode>', "ACL conflict mode: 'fail', 'skip', or 'merge' (default: fail)", 'fail')
  .option('--auto-partition-conflict <mode>', "auto-partition conflict mode: 'fail', 'skip', or 'merge' (default: fail)", 'fail')
  .action(async (file, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if (!path.isAbsolute(file)) {
      file = path.resolve(process.cwd(), file);
    }

    let progressTimer = null;
    let summary;

    if (cask.mode === 'http') {
      // HTTP mode: optimistic batch writes with local extraction
      let stats = { hashesUploaded: 0, filesWritten: 0, errors: [] };

      const printProgress = () => {
        process.stdout.write(
          `\r  Files: ${stats.filesWritten} written | Hashes: ${stats.hashesUploaded} uploaded   `
        );
      };

      summary = await cask.transfer.import(file, {
        overwrite: options.overwrite,
        aclConflict: options.aclConflict,
        autoPartitionConflict: options.autoPartitionConflict,
        cb: (current) => {
          stats = current;
          if (!progressTimer) {
            progressTimer = setInterval(printProgress, 250);
          }
        },
      });

      if (progressTimer) {
        clearInterval(progressTimer);
        printProgress();
        process.stdout.write('\n');
      }

      console.log(`\nImported from: ${file}`);
      console.log(`  hashes uploaded : ${summary.hashesUploaded}`);
      console.log(`  files written   : ${summary.filesWritten}`);
      if (summary.errors.length > 0) {
        console.log(`  errors          : ${summary.errors.length}`);
      }

    } else {
      // Direct-pg mode: stream archive directly to the server
      let bytesRead = 0;
      let startTime = Date.now();

      const printSpeed = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? bytesRead / elapsed : 0;
        process.stdout.write(`\r  Uploading... ${formatSpeed(speed)}   `);
      };

      summary = await cask.transfer.import(file, {
        overwrite: options.overwrite,
        aclConflict: options.aclConflict,
        autoPartitionConflict: options.autoPartitionConflict,
        cb: ({ type, current }) => {
          if (type !== 'cas') return;
          bytesRead = current;
          if (!progressTimer) {
            startTime = Date.now();
            progressTimer = setInterval(printSpeed, 250);
          }
        },
      });

      if (progressTimer) {
        clearInterval(progressTimer);
        printSpeed();
        process.stdout.write('\n');
      }

      console.log(`\nImported from: ${file}`);
      console.log(`  hashes imported : ${summary.hashCount}`);
      console.log(`  files imported  : ${summary.fileCount}`);
      console.log(`  files skipped   : ${summary.skippedFiles}`);
    }

    await endClient(cask);
  });

program.parse(process.argv);
