#! /usr/bin/env -S node

import { Command } from 'commander';
import fs from 'fs/promises';
import fsSync from 'fs';
import CaskFs from '../index.js';
import {createContext} from '../lib/context.js';
import {silenceLoggers} from '../lib/logger.js';
import path from 'path';
import os from 'os';
import config from '../lib/config.js';
import {parse as parseYaml} from 'yaml';
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import cliProgress from 'cli-progress';
import printLogo from './print-logo.js';
import { fileURLToPath } from 'url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fsSync.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8')
);

const program = new Command();
optsWrapper(program)

// set default requestor to current user if not set
config.acl.defaultRequestor = os.userInfo().username;

program
  .name('pgfarm')
  // .option('-V, --version', 'show version')
  .action(async () => {

    let versionInfo = pkg.version;
    try {
      let latest = await getLatestVersion();
      if( latest !== versionInfo ) {
        versionInfo = `${versionInfo} (latest: ${colors.green(latest)}. Run '${colors.yellow(`npm install -g @ucd-lib/pgfarm@${latest}`)}' to update)`;
      } else {
        versionInfo += colors.green(' (latest)');
      }
    } catch(e) {}


    printLogo(pkg);
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
    const cask = new CaskFs();

    handleGlobalOpts(options);

    if (options.dataFile === '-') {
      opts.readStream = process.stdin;
    } else {
      opts.readPath = options.dataFile;
      if( !path.isAbsolute(opts.readPath) ) {
        opts.readPath = path.resolve(process.cwd(), opts.readPath);
      }
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

    cask.dbClient.end();
  });

program
  .command('cp <source-path> <dest-path>')
  .description('Copy a file or directory into the CaskFS. If source-path is a directory, all files in the directory will be copied recursively.')
  .option('-x, --replace', 'Replace the file if it already exists', false)
  .option('-d, --dry-run', 'Show what would be copied without actually copying', false)
  .option('-b, --bucket <bucket>', 'Target bucket when copying to GCS')
  .action(async (sourcePath, destPath, options) => {
    silenceLoggers();
    
    handleGlobalOpts(options);
    
    if( !path.isAbsolute(sourcePath) ) {
      sourcePath = path.resolve(process.cwd(), sourcePath);
    }

    if( options.dryRun ) {
      console.log(`****
* Dry run mode, no files will be copied
****\n`);
    }

    let stats = {
      fileTypes : {
        linkedData: 0,
        binary : 0
      },
      insertedFiles : 0,
      replacedFiles : 0,
      updatedMetadata : 0,
      parsedLinkedData : 0,
      casWrites : 0,
      casDeletes : 0
    };

    const cask = new CaskFs();
    let location;

    // is the source path a file or directory?
    let stat = await fs.stat(sourcePath);
    if( !stat.isDirectory() ) {
      destPath = path.resolve(destPath, path.basename(sourcePath));
      
      let context = createContext({
        filePath: destPath,
        requestor: options.requestor,
        bucket: options.bucket,
        readPath: sourcePath,
        replace: options.replace
      });
      
      location = await cask.getCasLocation(context);
      console.log(`Copying file ${sourcePath} to (${location}) ${destPath}`);
      if( !options.dryRun ) {
        await cask.write(context);
      }
      cask.dbClient.end();
      return;
    }

    // recursively get all files in sourcePath
    let files = await fs.readdir(sourcePath, { withFileTypes: true, recursive: true });
    files = files.filter(f => f.isFile()).map(f => path.join(f.parentPath, f.name));

    let failed = [];
    let context;

    console.log('Copying files from directory', sourcePath);
    console.log('');
    
    let pbar = new cliProgress.Bar(
      {etaBuffer: 50}, 
      cliProgress.Presets.shades_classic
    ); 
    let total = files.filter(f => !f.match(/\/\./)).length;
    let filesCopied = 0;
    pbar.start(total, 0);

    for( let file of files ) {
      if( file.match(/\/\./) ) continue; // skip hidden files

      let destFile = path.join(destPath, path.relative(sourcePath, file))

      context = createContext({
        filePath: destFile,
        requestor: options.requestor,
        bucket: options.bucket,
        readPath: file,
        replace: options.replace
      });

      location = await cask.getCasLocation(context);
      // console.log(`Copying file ${file} to (${location}) ${destFile}`);
      if( !options.dryRun ) {
        try {
          await cask.write(context);

          if( context.data.actions.detectedLd ) {
            stats.fileTypes.linkedData++;
          } else {
            stats.fileTypes.binary++;
          }
          if( context.data.actions.fileInsert ) stats.insertedFiles++;
          if( context.data.actions.replacedFile ) stats.replacedFiles++;
          if( context.data.actions.updatedMetadata ) stats.updatedMetadata++;
          if( context.data.actions.parsedLinkedData ) stats.parsedLinkedData++;
          if( context.data.actions.fileCopiedToCas ) stats.casWrites++;
          if( context.data.actions.deletedOldHashFile ) stats.casDeletes++;

          pbar.update(filesCopied++);
        } catch (err) {
          // console.error(`Failed to copy ${file} to ${destFile}: ${err.message}`);
          // console.error(err.stack);
          // if( err.details ) {
          //   console.error(err.details);
          // }
          failed.push(file);
        }
      }
    }

    pbar.stop();

    console.log(`\nCopied ${filesCopied-failed.length} files to CaskFS`);

    if( failed.length > 0 ) {
      console.log(`\nThe following ${failed.length} files failed to copy:`);
      failed.forEach(f => console.log(`  - ${f}`));
    }

    console.log('\nCopy statistics:');
    console.log(`  - Total files processed: ${filesCopied}`);
    console.log(`  - New files inserted: ${stats.insertedFiles}`);
    console.log(`  - Existing files replaced: ${stats.replacedFiles}`);
    console.log(`  - Files with updated metadata (includes inserts): ${stats.updatedMetadata}`);
    console.log(`  - Binary files copied: ${stats.fileTypes.binary}`);
    console.log(`  - Linked Data files copied: ${stats.fileTypes.linkedData}`);
    console.log(`  - Linked Data files parsed: ${stats.parsedLinkedData}`);
    console.log(`  - CAS writes: ${stats.casWrites}`);
    console.log(`  - CAS deletes: ${stats.casDeletes}`);

    cask.dbClient.end();
    return;
  });

program
  .command('metadata <file-path>')
  .description('Get metadata for a file')
  .action(async (filePath, options={}) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();
    const context = createContext({
      filePath,
      requestor: options.requestor
    });
    console.log(await cask.metadata(context));
    cask.dbClient.end();
  });

program
  .command('read <file-path>')
  .description('Get contents of a file')
  .action(async (filePath, options={}) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();
    const context = createContext({
      filePath,
      requestor: options.requestor,
      user: options.user
    });
    console.log((await cask.read(context)).toString('utf-8'));
    cask.dbClient.end();
  });

program
  .command('ld')
  .description('Read linked data and output as supported RDF format to stdout')
  .option('-f, --file <file-path>', 'Only include RDF triples for the specified file')
  .option('-s, --subject <subject-uri>', 'Only include RDF triples with the specified subject')
  .option('-o, --object <object-uri>', 'Only include RDF triples with the specified object')
  .option('-g, --graph <graph-uri>', 'Only include RDF triples in the specified graph. Must be used with --subject or --file')
  .option('-k, --partition-keys <keys>', 'Only include RDF triples with the specified partition keys (comma-separated). Must be used with --subject or --file')
  .option('-e, --format <format>', 'RDF format to output: jsonld, compact, flattened, expanded, nquads or json. Default is jsonld', 'jsonld')
  .action(async (options) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();

    if( options.partition ) {
      options.partition = options.partition.split(',').map(k => k.trim());
    }

    let resp = await cask.rdf.read(options);

    if( typeof resp === 'object' ) {
      console.log(JSON.stringify(resp, null, 2));
    } else {
      process.stdout.write(resp);
    }
    cask.dbClient.end();
  });

program
  .command('rel <file-path>')
  .alias('relationships')
  .description('Get relationships for a file in the CASK FS')
  .option('-p, --predicate <predicate>', 'Only include relationships with the specified predicate, comma-separated')
  .option('-i, --ignore-predicate <predicate>', 'Only include relationships that do NOT have the specified predicate(s), comma-separated')
  .option('-k, --partition-keys <keys>', 'Only include relationships with the specified partition keys (comma-separated)')
  .option('-g, --graph <graph-uri>', 'Only include relationships in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include relationships with the specified subject URI')
  .option('-t, --stats', 'Show counts of file relationships by predicate instead of individual relationships', false)
  .option('-d, --debug-query', 'Output the SQL query used to find the files', false)
  .action(async (filePath, options) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();

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
    cask.dbClient.end();
  });

program
  .command('find')
  .description('Get files that have any of the following:')
  .option('-p, --predicate <predicate>', 'Only include files with the specified predicate')
  .option('-k, --partition-keys <keys>', 'Only include files with the specified partition keys (comma-separated)')
  .option('-g, --graph <graph-uri>', 'Only include files in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include files with the specified subject URI')
  .option('-o, --object <object-uri>', 'Only include files with the specified object URI')
  .option('-l, --limit <number>', 'Limit the number of results returned', parseInt)
  .option('-f, --offset <number>', 'Offset the results returned by the specified number', parseInt)
  .option('-d, --debug-query', 'Output the SQL query used to find the files', false)
  .action(async (options) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();

    if( options.partitionKeys ) {
      options.partitionKeys = options.partitionKeys.split(',').map(k => k.trim());
    }

    console.log(await cask.rdf.find(options));
    cask.dbClient.end();
  });

program
  .command('rm <file-path>')
  .description('Remove a file from the filesystem layer and the underlying storage')
  .option('-s, --soft-delete', 'Never delete the file from the underlying storage, even if all references are removed', false)
  .action(async (filePath, options) => {
    handleGlobalOpts(options);

    const cask = new CaskFs();
    const resp = await cask.delete(filePath, { 
      softDelete: options.softDelete,
      user: options.user
    });
    console.log(resp);
    cask.dbClient.end();
  });

program
  .command('ls <directory>')
  .option('-o, --output <output>', 'Output format: text (default) or json', 'text')
  .description('List files')
  .action(async (directory, options) => {
    handleGlobalOpts(options);

    let partitionKeys = options.partitionKeys ? options.partitionKeys.split(',').map(k => k.trim()) : undefined;
    const caskfs = new CaskFs();
    const resp = await caskfs.ls({
      directory,
      requestor: options.requestor
    });

    if (options.output === 'json') {
      delete resp.query;
      console.log(JSON.stringify(resp, null, 2));
      return;
    }

    if( resp.directories ) {
      resp.directories.forEach(d => {
        console.log(`d ${d.fullname}`);
      });
    }

    resp.files.forEach(f => {
      let keys = f.partition_keys ? f.partition_keys.join(',') : '';
      let directory = f.directory ? f.directory.replace(/\/+$/, '') + '/' : '';
      console.log(`f ${directory}${f.filename} `);
    });

    caskfs.dbClient.end();
  });

program.command('acl', 'Manage ACL rules');
program.command('auto-path', 'Manage auto-path rules');
program.command('env', 'Manage cask cli environment');

program
  .command('stats')
  .description('Get statistics about the CaskFS')
  .action(async () => {
    const caskfs = new CaskFs();
    console.log(await caskfs.stats());
    caskfs.dbClient.end();
  });

program
  .command('init-pg')
  .description('Initialize the PostgreSQL database')
  .option('-r, --user-roles-file <user-roles-file>', 'Path to a JSON or YAML file containing user roles to initialize after setting up the database')
  .action(async (options) => {
    const cask = new CaskFs();

    await cask.dbClient.init();

    if( options.userRolesFile ) {
      let userRoles = await loadUserRolesFile(options.userRolesFile);
      await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    }

    cask.dbClient.end();
  });

program
  .command('init-user-roles <user-roles-file>')
  .description('Initialize user roles in the PostgreSQL database')
  .action(async (userRolesFile) => {
    let userRoles = await loadUserRolesFile(userRolesFile);

    const cask = new CaskFs();
    await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    cask.dbClient.end();
  });

program
  .command('powerwash')
  .description('Power wash the CaskFS - WARNING: This will delete ALL data and metadata!')
  .option('-a, --include-admin', 'Set current user to admin role', false)
  .option('-r, --user-roles-file <user-roles-file>', 'Path to a JSON or YAML file containing user roles to initialize after powerwash')
  .action(async (options) => {
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
      let userRoles = await loadUserRolesFile(options.userRolesFile);
      await cask.ensureUserRoles(handleGlobalOpts({}), userRoles);
    }

    cask.dbClient.end();
  });

program
  .command('whoami')
  .description('Show the current user')
  .action(async (options) => {
    handleGlobalOpts(options);
    console.log(`Current User: ${options.requestor || 'public (no user)'}`);
    if( options.requestor ) {
      const cask = new CaskFs();
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
      cask.dbClient.end();
    }
  });

program
  .command('serve')
  .description('Start the CaskFs web application')
  .option('-p, --port <port>', 'Port to run the web application on')
  .action(async (options) => {
    const { startServer } = await import('../client/index.js');
    startServer(options);
  });

async function loadUserRolesFile(userRolesFile) {
  if( !path.isAbsolute(userRolesFile) ) {
    userRolesFile = path.resolve(process.cwd(), userRolesFile);
  }
  if( !fsSync.existsSync(userRolesFile) ) {
    console.error(`User roles file ${userRolesFile} does not exist`);
    process.exit(1);
  }

  let data = await fs.readFile(userRolesFile, 'utf-8');
  let userRoles;
  if( userRolesFile.match(/\.ya?ml$/) ) {
    userRoles = parseYaml(data);
  } else {
    userRoles = JSON.parse(data);
  }
  return userRoles;
}

program.parse(process.argv);
