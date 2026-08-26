#! /usr/bin/env -S node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { optsWrapper, handleGlobalOpts } from './opts-wrapper.js';
import { getClient, endClient } from './lib/client.js';

const program = new Command();
optsWrapper(program);

program
  .command('rotate')
  .description('Export audit_log partitions older than the configured hot window to gzipped JSONL, then drop them from Postgres. Intended to be run on a schedule (cron / k8s CronJob).')
  .option('--dry-run', 'List partitions that would be rotated without exporting or dropping anything', false)
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const result = await cask.rotateAuditLog({ dryRun: options.dryRun, requestor: options.requestor });

    if( result.rotated ) {
      for( const r of result.rotated ) {
        console.log(`Rotated ${r.partition}: exported ${r.rowCount} row(s) -> ${r.archivePath}`);
      }
    } else if( result.partitions.length === 0 ) {
      console.log('No audit_log partitions are older than the configured hot window - nothing to rotate.');
    } else {
      console.log(`Would rotate ${result.partitions.length} partition(s): ${result.partitions.join(', ')}`);
    }

    await endClient(cask);
  });

program
  .command('list')
  .description('List rotated audit_log archive files')
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const archives = await cask.listAuditArchives({ requestor: options.requestor });
    if( archives.length === 0 ) {
      console.log('No audit archives found.');
    } else {
      for( const a of archives ) {
        console.log(`${a.name}\t${a.size} bytes\t${a.modified}`);
      }
    }

    await endClient(cask);
  });

program
  .command('get <name>')
  .description('Download a rotated audit_log archive file (raw gzipped bytes)')
  .option('-o, --output <path>', 'Local path to write the archive to. Defaults to ./<name>')
  .action(async (name, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const { stream } = await cask.getAuditArchive({ name, requestor: options.requestor });
    const outputPath = options.output || path.join(process.cwd(), name);
    await pipeline(stream, fs.createWriteStream(outputPath));
    console.log(`Wrote ${outputPath}`);

    await endClient(cask);
  });

program
  .command('delete <name>')
  .description('Permanently delete a rotated audit_log archive file')
  .action(async (name, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    await cask.deleteAuditArchive({ name, requestor: options.requestor });
    console.log(`Deleted ${name}`);

    await endClient(cask);
  });

program
  .command('log <path>')
  .description('Show the full audit history for a file or directory. Requires write permission on the resource.')
  .option('-f, --is-file', 'Treat <path> as a file rather than a directory', false)
  .action(async (targetPath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const entries = await cask.getAuditLog({
      filePath: targetPath,
      isFile: options.isFile,
      requestor: options.requestor
    });

    if( entries.length === 0 ) {
      console.log('No audit history for this resource.');
    } else {
      for( const e of entries ) {
        console.log(`${e.created}\t${e.requestor}\t${e.operation}\t${e.resource_path}`);
      }
    }

    await endClient(cask);
  });

program.parse(process.argv);
