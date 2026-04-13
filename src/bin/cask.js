#! /usr/bin/env -S node

import { Command } from 'commander';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import {createContext} from '../lib/context.js';
import {silenceLoggers} from '../lib/logger.js';
import path from 'path';
import os from 'os';
import config from '../lib/config.js';
import git from '../lib/git.js';
import {parse as parseYaml} from 'yaml';
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import cliProgress from 'cli-progress';
import printLogo, { printConnection } from './print-logo.js';
import { getClient, endClient, assertDirectPg } from './lib/client.js';
import { fileURLToPath } from 'url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fsSync.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8')
);

const program = new Command();
optsWrapper(program)

// set default requestor to current user if not set
config.acl.defaultRequestor = os.userInfo().username;

/**
 * @function hashFile
 * @description Compute the sha256 hex digest of a local file using a streaming read.
 * @param {String} filePath - absolute path to the file
 * @returns {Promise<String>}
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filePath);
    stream.on('data',  chunk => hash.update(chunk));
    stream.on('end',   ()    => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * @function confirm
 * @description Prompt the user for a yes/no answer; resolves true for yes.
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

/**
 * @function buildGitMetadata
 * @description Convert a git info object into a flat metadata object with `git-*` keys,
 * matching the format used by CaskFS write/sync internally.
 * @param {Object|null} gitInfo
 * @returns {Object}
 */
function buildGitMetadata(gitInfo) {
  if (!gitInfo) return {};
  const m = {};
  for (const key of config.git.metadataProperties) {
    if (gitInfo[key] != null) m[`git-${key}`] = gitInfo[key];
  }
  return m;
}

program
  .name('CaskFs')
  .action(async () => {
    printLogo(pkg);
  });

program
  .command('info')
  .description('Show active connection and CaskFS version')
  .action(async (options) => {
    handleGlobalOpts(options);
    printLogo(pkg);
    console.log('');
    printConnection(options.environment);
  });

program
  .command('write')
  .argument('<file-path>', 'Full path (including filename) where the file will be written in the filesystem layer')
  .requiredOption('-d, --data-file <data-file>', 'Path to the data file to write. Use "-" to read from stdin')
  .option('-r, --replace', 'Replace the file if it already exists', false)
  .option('-k, --partition-keys <keys>', 'comma-separated list of partition keys')
  .option('-l, --jsonld', 'treat input as JSON-LD')
  .option('-m, --mime-type <mime-type>', 'MIME type of the file being written, default is auto-detected from file extension')
  .description('Write a file')
  .action(async (filePath, options) => {
    let opts = {};
    handleGlobalOpts(options);
    const cask = getClient(options);

    if (options.dataFile === '-') {
      opts.readStream = process.stdin;
    } else {
      opts.readPath = options.dataFile;
      if( !path.isAbsolute(opts.readPath) ) {
        opts.readPath = path.resolve(process.cwd(), opts.readPath);
      }
      try {
        opts.git = await git.info(opts.readPath);
      } catch(e) {}
    }

    let partitionKeys = (options.partitionKeys ? options.partitionKeys.split(',') : [])
      .map(k => k.trim());

    let mimeType = options.mimeType;
    if( options.jsonld ) {
      mimeType = 'application/ld+json';
    }

    opts.partitionKeys = partitionKeys;
    opts.mimeType = mimeType;
    opts.replace = options.replace;
    opts.requestor = options.requestor;
    opts.filePath = filePath;

    await cask.write(opts);

    await endClient(cask);
  });

program
  .command('cp <source-path> <dest-path>')
  .description('Copy a file or directory into CaskFS. Directories are copied recursively using optimistic batch sync.')
  .option('-x, --replace', 'Replace files if they already exist', false)
  .option('-d, --dry-run', 'Show what would be copied without actually copying', false)
  .option('-b, --bucket <bucket>', 'Target bucket when copying to GCS')
  .option('-y, --yes', 'Skip the confirmation prompt', false)
  .action(async (sourcePath, destPath, options) => {
    silenceLoggers();
    handleGlobalOpts(options);
    const cask = getClient(options);

    if (!path.isAbsolute(sourcePath)) {
      sourcePath = path.resolve(process.cwd(), sourcePath);
    }

    // ── single file ──────────────────────────────────────────────────────────
    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) {
      const destFile = path.join(destPath, path.basename(sourcePath));
      let gitInfo;
      try { gitInfo = await git.info(sourcePath); } catch(e) {}

      const context = createContext({
        filePath:  destFile,
        requestor: options.requestor,
        bucket:    options.bucket,
        readPath:  sourcePath,
        replace:   options.replace,
        git:       gitInfo,
      });
      const location = await cask.getCasLocation(context);
      console.log(`Copying ${sourcePath} → (${location}) ${destFile}`);

      if (!options.dryRun) {
        await cask.write(context);
      }
      await endClient(cask);
      return;
    }

    // ── directory: pre-scan ──────────────────────────────────────────────────
    let allFiles = await fs.readdir(sourcePath, { withFileTypes: true, recursive: true });
    allFiles = allFiles
      .filter(f => f.isFile() && !f.name.startsWith('.') && !f.parentPath.match(/\/\./))
      .map(f => path.join(f.parentPath, f.name));

    const totalFiles = allFiles.length;

    console.log('');
    console.log(`  Source      : ${sourcePath}`);
    console.log(`  Destination : cask:${destPath}`);
    console.log(`  Files       : ${totalFiles}`);
    console.log('');

    if (options.dryRun) {
      console.log('Dry run — no files will be copied.');
      await endClient(cask);
      return;
    }

    if (!options.yes) {
      const ok = await confirm('Proceed with copy?');
      if (!ok) {
        console.log('Copy cancelled.');
        await endClient(cask);
        return;
      }
    }

    // ── batch sync ───────────────────────────────────────────────────────────
    const BATCH_SIZE = 100;
    const isHttp = cask.mode === 'http';
    const cpStats = {
      filesProcessed:  0,
      filesInserted:   0,
      metadataUpdates: 0,
      noChanges:       0,
      errors:          [],
    };

    const pBar = new cliProgress.SingleBar({
      format: 'Copying... {bar} {percentage}% | {files}/{totalFiles} files | {rate} files/s',
      hideCursor: true,
    });
    let lastBatchFiles = 0;
    let lastBatchTime  = Date.now();
    pBar.start(totalFiles, 0, { files: 0, totalFiles, rate: '0' });

    // srcFile → destFile lookup for doesNotExist individual writes
    const srcByDest    = new Map();
    const gitInfoByDest = new Map();

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batchSrc = allFiles.slice(i, i + BATCH_SIZE);

      // Compute hashes and gather git info in parallel across the batch
      const batchDescriptors = await Promise.all(batchSrc.map(async srcFile => {
        const destFile = path.join(destPath, path.relative(sourcePath, srcFile));
        srcByDest.set(destFile, srcFile);

        const hash = await hashFile(srcFile);
        let gitInfo;
        try { gitInfo = await git.info(srcFile); } catch(e) {}
        gitInfoByDest.set(destFile, gitInfo);

        const gitMeta = buildGitMetadata(gitInfo);
        return {
          filePath: destFile,
          hash,
          metadata: Object.keys(gitMeta).length ? gitMeta : undefined,
        };
      }));

      // Optimistic batch: resolve which files are already in CAS
      let result;
      try {
        if (isHttp) {
          result = await cask.optimisticBatchWrite(batchDescriptors);
        } else {
          result = await cask.sync({ requestor: options.requestor }, {
            files:   batchDescriptors,
            replace: options.replace,
          });
        }
      } catch(err) {
        for (const d of batchDescriptors) cpStats.errors.push({ path: d.filePath, message: err.message });
        cpStats.filesProcessed += batchSrc.length;
        continue;
      }

      cpStats.filesInserted   += result.fileInserts?.length    || 0;
      cpStats.metadataUpdates += result.metadataUpdates?.length || 0;
      cpStats.noChanges       += result.noChanges?.length      || 0;
      for (const e of (result.errors || [])) cpStats.errors.push(e);

      // Full streaming write for files whose hash is not yet in CAS
      for (const destFile of (result.doesNotExist || [])) {
        const srcFile = srcByDest.get(destFile);
        if (!srcFile) continue;

        const gitInfo = gitInfoByDest.get(destFile);
        const gitMeta = buildGitMetadata(gitInfo);

        try {
          if (isHttp) {
            await cask.write({
              filePath: destFile,
              readPath: srcFile,
              replace:  options.replace,
              bucket:   options.bucket,
              metadata: Object.keys(gitMeta).length ? gitMeta : undefined,
            });
          } else {
            await cask.write(createContext({
              filePath:  destFile,
              requestor: options.requestor,
              bucket:    options.bucket,
              readPath:  srcFile,
              replace:   options.replace,
              git:       gitInfo,
            }));
          }
          cpStats.filesInserted++;
        } catch(err) {
          cpStats.errors.push({ path: destFile, message: err.message });
        }
      }

      cpStats.filesProcessed += batchSrc.length;

      const now     = Date.now();
      const elapsed = (now - lastBatchTime) / 1000;
      const delta   = cpStats.filesProcessed - lastBatchFiles;
      const rate    = elapsed > 0 ? (delta / elapsed).toFixed(1) : '0';
      lastBatchFiles = cpStats.filesProcessed;
      lastBatchTime  = now;

      pBar.update(cpStats.filesProcessed, { files: cpStats.filesProcessed, totalFiles, rate });
    }

    pBar.stop();

    console.log(`\nCopied from: ${sourcePath}`);
    console.log(`  files processed  : ${cpStats.filesProcessed}`);
    console.log(`  files inserted   : ${cpStats.filesInserted}`);
    console.log(`  metadata updated : ${cpStats.metadataUpdates}`);
    console.log(`  no changes       : ${cpStats.noChanges}`);
    if (cpStats.errors.length > 0) {
      console.log(`  errors           : ${cpStats.errors.length}`);
    }

    await endClient(cask);
  });

program
  .command('metadata <file-path>')
  .description('Get metadata for a file')
  .action(async (filePath, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    const context = createContext({
      filePath,
      requestor: options.requestor
    });
    console.log(await cask.metadata(context));
    await endClient(cask);
  });

program
  .command('read <file-path>')
  .description('Get contents of a file')
  .action(async (filePath, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    const context = createContext({
      filePath,
      requestor: options.requestor,
      user: options.user
    });
    console.log((await cask.read(context)).toString('utf-8'));
    await endClient(cask);
  });

program
  .command('ld <file-path>')
  .description('Read linked data and output as supported RDF format to stdout')
  .option('-o, --format <format>', 'RDF format to output: jsonld, compact, flattened, expanded, nquads or json. Default is jsonld', 'jsonld')
  .action(async (filePath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    options.filePath = filePath;
    let resp = await cask.rdf.read(options);

    if( typeof resp === 'object' ) {
      console.log(JSON.stringify(resp, null, 2));
    } else {
      process.stdout.write(resp);
    }
    await endClient(cask);
  });

program
  .command('literal')
  .description('Read literal (text) values from the RDF store with optional filters')
  .option('-g, --graph <graph-uri>', 'Only include literals in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include literals with the specified subject URI')
  .option('-p, --predicate <predicate>', 'Only include literals with the specified predicate')
  .option('-f, --file-path <file-path>', 'Only include literals associated with the specified file path')
  .option('-k, --partition-keys <keys>', 'Only include literals associated with files having the specified partition keys (comma-separated)')
  .option('-l, --limit <number>', 'Limit the number of results returned', parseInt)
  .option('-n, --offset <number>', 'Offset the results returned by the specified number', parseInt)
  .option('-o, --format <format>', 'RDF format to output: jsonld, compact, flattened, expanded, nquads or json. Default is jsonld', 'jsonld')
  .option('-d, --debug-query', 'Output the SQL query used to find the literals', false)
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if( options.partitionKeys ) {
      options.partitionKeys = options.partitionKeys.split(',').map(k => k.trim());
    }

    let resp = await cask.rdf.literal(options);

    if( options.debugQuery ) {
      console.log('SQL Query:');
      console.log(resp.query);
      console.log(resp.args);
      await endClient(cask);
      return;
    }

    if( typeof resp.results === 'object' ) {
      console.log(JSON.stringify(resp, null, 2));
    } else {
      process.stdout.write(resp.results);
    }
    await endClient(cask);
  });

program
  .command('rel <file-path>')
  .alias('relationships')
  .description('Get relationships for a file in the CASK FS')
  .option('-p, --predicate <predicate>', 'Only include relationships with the specified predicate, comma-separated')
  .option('-k, --partition-keys <keys>', 'Only include relationships with the specified partition keys (comma-separated)')
  .option('-g, --graph <graph-uri>', 'Only include relationships in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include relationships with the specified subject URI')
  .option('-t, --stats', 'Show counts of file relationships by predicate instead of individual relationships', false)
  .option('-d, --debug-query', 'Output the SQL query used to find the files', false)
  .action(async (filePath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if( options.partitionKeys ) {
      options.partitionKeys = options.partitionKeys.split(',').map(k => k.trim());
    }

    if( options.predicate ) {
      options.predicate = options.predicate.split(',').map(k => k.trim());
    }

    if( options.ignorePredicate ) {
      options.ignorePredicate = options.ignorePredicate.split(',').map(k => k.trim());
    }

    options.filePath = filePath;
    console.log(JSON.stringify(await cask.relationships(options), null, 2));
    await endClient(cask);
  });

program
  .command('find')
  .description('Get files that have any of the following:')
  .option('-p, --predicate <predicate>', 'Only include files with the specified predicate')
  .option('-k, --partition-keys <keys>', 'Only include files with the specified partition keys (comma-separated)')
  .option('-g, --graph <graph-uri>', 'Only include files in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include files with the specified subject URI')
  .option('-o, --object <object-uri>', 'Only include files with the specified object URI')
  .option('-t, --type <type-uri>', 'Only include files with the specified RDF type URI')
  .option('-l, --limit <number>', 'Limit the number of results returned', parseInt)
  .option('-f, --offset <number>', 'Offset the results returned by the specified number', parseInt)
  .option('-d, --debug-query', 'Output the SQL query used to find the files', false)
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    if( options.partitionKeys ) {
      options.partitionKeys = options.partitionKeys.split(',').map(k => k.trim());
    }

    let resp = await cask.rdf.find(options);

    if( options.debugQuery ) {
      console.log('SQL Query:');
      console.log(resp.query);
      console.log(resp.args);
      await endClient(cask);
      return;
    }

    console.log(resp);
    await endClient(cask);
  });

program
  .command('rm <file-path>')
  .description('Remove a file from the filesystem layer and the underlying storage')
  .option('-d, --directory', 'Indicates that the file-path is a directory and all files in the directory should be deleted recursively', false)
  .option('-s, --soft-delete', 'Never delete the file from the underlying storage, even if all references are removed', false)
  .action(async (filePath, options) => {
    handleGlobalOpts(options);

    options.filePath = filePath;

    const cask = getClient(options);

    if( options.directory ) {
      options.directory = filePath;
      await cask.deleteDirectory(options);
    } else {
      const resp = await cask.deleteFile(options);
      console.log(resp);
    }

    await endClient(cask);
  });

program
  .command('ls <directory>')
  .option('-o, --output <output>', 'Output format: text (default) or json', 'text')
  .description('List files')
  .action(async (directory, options) => {
    handleGlobalOpts(options);

    const cask = getClient(options);
    const resp = await cask.ls({
      directory,
      requestor: options.requestor
    });

    if (options.output === 'json') {
      delete resp.query;
      console.log(JSON.stringify(resp, null, 2));
      await endClient(cask);
      return;
    }

    if( resp.directories ) {
      resp.directories.forEach(d => {
        console.log(`d ${d.fullname}`);
      });
    }

    resp.files.forEach(f => {
      let directory = f.directory ? f.directory.replace(/\/+$/, '') + '/' : '';
      console.log(`f ${directory}${f.filename} `);
    });

    await endClient(cask);
  });

program.command('acl', 'Manage ACL rules');
program.command('auto-path', 'Manage auto-path rules');
program.command('env', 'Manage cask cli environment');
program.command('admin', 'CaskFS administrative commands');
program.command('archive', 'Import and export CaskFS archives');
program.command('auth', 'Authenticate with a CaskFS server');

// Forward global options to external subcommands via environment variables.
// Commander consumes parent-level options before spawning the child process,
// so they must be re-injected another way.
program.hook('preSubcommand', (thisCommand, subCommand) => {
  if (!subCommand._executableHandler) return;
  const opts = thisCommand.opts();
  if (opts.impersonate) process.env.CASKFS_IMPERSONATE = opts.impersonate;
  if (opts.env)         process.env.CASKFS_ENV_OVERRIDE = opts.env;
  if (opts.publicUser)  process.env.CASKFS_PUBLIC_USER  = 'true';
});

program
  .command('init-pg')
  .description('Initialize the PostgreSQL database')
  .option('-r, --user-roles-file <user-roles-file>', 'Path to a JSON or YAML file containing user roles to initialize after setting up the database')
  .action(async (options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'init-pg');

    await cask.dbClient.init();

    if( options.userRolesFile ) {
      let userRoles = JSON.parse(await fs.readFile(options.userRolesFile, 'utf-8'));
      await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    }

    await endClient(cask);
  });

program
  .command('init-user-roles <user-roles-file>')
  .description('Initialize user roles in the PostgreSQL database')
  .action(async (userRolesFile, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'init-user-roles');

    let userRoles = JSON.parse(await fs.readFile(userRolesFile, 'utf-8'));
    await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    await endClient(cask);
  });

program
  .command('whoami')
  .description('Show the current user')
  .action(async (options) => {
    handleGlobalOpts(options);
    console.log(`Current User: ${options.requestor || 'public (no user)'}`);
    if( options.requestor ) {
      const cask = getClient(options);
      assertDirectPg(cask, 'whoami');
      let resp = await cask.acl.getUserRoles({
        user: options.requestor,
        dbClient: cask.dbClient
      });
      console.log('Roles:');
      if( resp.length === 0 ) {
        console.log('  (none)');
      } else {
        console.log(' - '+resp.join('\n - '));
      }
      await endClient(cask);
    }
  });

program
  .command('serve')
  .description('Start the CaskFs web application')
  .option('-p, --port <port>', 'Port to run the web application on')
  .option('-r, --path-prefix <path-prefix>', 'Path prefix to mount the web application at')
  .action(async (options) => {
    handleGlobalOpts(options);

    if( options.environment && options.environment?.config?.clientEnv === 'dev' ) {
      console.log('Starting CaskFs web application in development mode');
      config.webapp.isDevEnv = true;
    }

    if ( options.pathPrefix ) {
      config.webapp.basepath = options.pathPrefix;
    }

    const { startServer } = await import('../client/index.js');
    startServer(options);
  });

program.parse(process.argv);
