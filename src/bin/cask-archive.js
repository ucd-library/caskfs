#! /usr/bin/env -S node

import { Command } from 'commander';
import path from 'path';
import readline from 'readline';
import { optsWrapper, handleGlobalOpts } from './opts-wrapper.js';
import { getClient, endClient } from './lib/client.js';
import { setLogLevel } from '../../src/lib/logger.js';
import { Transfer } from './lib/transfer.js';
import CliProgress from 'cli-progress';
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

// make sure to clean up any temporary files if the process exits during import
let tmpFile;
async function cleanupTmpFile() {
  if( tmpFile && fs.existsSync(tmpFile) ) {
    await fs.promises.rm(tmpFile, { recursive: true });
    tmpFile = null;
  }
}
process.on('exit', cleanupTmpFile);
process.on('SIGINT', () => {
  cleanupTmpFile().then(() => process.exit());
});
process.on('SIGTERM', () => {
  cleanupTmpFile().then(() => process.exit());
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
    setLogLevel('fatal'); // suppress non-error logs during import

    if (!path.isAbsolute(file)) {
      file = path.resolve(process.cwd(), file);
    }

    const pBar = new CliProgress.SingleBar({
      format: 'Importing... {bar} {percentage}% | {files}/{totalFiles} files | {rate} files/s',
      hideCursor: true,
    });
    let pBarStarted = false;
    let totalFiles = 0;

    // Timing state for per-batch files/second calculation
    let lastBatchFiles = 0;
    let lastBatchTime  = Date.now();

    const transfer = new Transfer();

    const summary = await transfer.fsImport(file, {
      cask,
      requestor: options.requestor,
      dbClient: cask.dbClient,
      overwrite: options.overwrite,
      aclConflict: options.aclConflict,
      autoPartitionConflict: options.autoPartitionConflict,
      cb: (msg) => {
        if (msg.type === 'tmp-file') {
          tmpFile = msg.path;
        }
        if (msg.type === 'extract-complete') {
          console.log('Extraction complete. Scanning archive...');
        }
        if (msg.type === 'preflight-complete') {
          totalFiles = msg.stats.totalFiles;
          pBar.start(totalFiles, 0, { files: 0, totalFiles, rate: '0' });
          pBarStarted = true;
          lastBatchTime = Date.now();
        }
        if (msg.type === 'batch-sync') {
          const now      = Date.now();
          const elapsed  = (now - lastBatchTime) / 1000;
          const delta    = msg.stats.filesProcessed - lastBatchFiles;
          const rate     = elapsed > 0 ? (delta / elapsed).toFixed(1) : '0';
          lastBatchFiles = msg.stats.filesProcessed;
          lastBatchTime  = now;
          pBar.update(msg.stats.filesProcessed, { files: msg.stats.filesProcessed, totalFiles, rate });
        }
      },
    });

    if (pBarStarted) pBar.stop();

    console.log(`\nImported from: ${file}`);
    console.log(`  files processed : ${summary.filesProcessed}`);
    console.log(`  files inserted  : ${summary.filesInserted}`);
    if (summary.hashesUploaded !== undefined) {
      console.log(`  hashes uploaded : ${summary.hashesUploaded}`);
    }
    if (summary.metadataUpdates !== undefined) {
      console.log(`  metadata updated: ${summary.metadataUpdates}`);
    }
    if (summary.noChanges !== undefined) {
      console.log(`  no changes      : ${summary.noChanges}`);
    }
    const errorCount = Array.isArray(summary.errors) ? summary.errors.length : summary.errors;
    if (errorCount > 0) {
      console.log(`  errors          : ${errorCount}`);
    }

    await endClient(cask);
    process.exit(0);
  });

program.parse(process.argv);
