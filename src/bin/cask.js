#! /usr/bin/env -S node

import { Command } from 'commander';
import fs from 'fs/promises';
import CaskFs from '../index.js';
import createContext from '../lib/context.js';
import path from 'path';

const program = new Command();

program
  .command('write <file-path>')
  .requiredOption('-d, --data-file <data-file>', 'Path to the data file to write. Use "-" to read from stdin')
  .option('-r, --replace', 'Replace the file if it already exists', false)
  .option('-p, --partition-keys <keys>', 'comma-separated list of partition keys')
  .option('-l, --jsonld', 'treat input as JSON-LD')
  .option('-m, --mime-type <mime-type>', 'MIME type of the file being written, default is auto-detected from file extension')
  .description('Write a file to the CASKFS')
  .action(async (filePath, options) => {
    let opts = {};
    const cask = new CaskFs();

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


    let context = await createContext({file: filePath});
    await cask.write(context, opts);

    cask.dbClient.end();
  });

program
  .command('cp <source-path> <dest-path>')
  .description('Copy a file within the CASKFS')
  .option('-x, --replace', 'Replace the file if it already exists', false)
  .option('-d, --dry-run', 'Show what would be copied without actually copying', false)
  .action(async (sourcePath, destPath, options) => {
    if( !path.isAbsolute(sourcePath) ) {
      sourcePath = path.resolve(process.cwd(), sourcePath);
    }

    if( options.dryRun ) {
      console.log(`****
* Dry run mode, no files will be copied
****\n`);
    }

    const cask = new CaskFs();

    // is the source path a file or directory?
    let stat = await fs.stat(sourcePath);
    if( !stat.isDirectory() ) {
      destPath = path.resolve(destPath, path.basename(sourcePath));
      console.log(`Copying file ${sourcePath} to ${destPath}`);
      if( !options.dryRun ) {
        let context = await createContext({file: destPath});
        await cask.write(context, {
          readPath: sourcePath,
          replace: options.replace
        });
      }
      cask.dbClient.end();
      return;
    }

    // recursively get all files in sourcePath
    let files = await fs.readdir(sourcePath, { withFileTypes: true, recursive: true });
    files = files.filter(f => f.isFile()).map(f => path.join(f.path, f.name));

    let failed = [];
    let context;
    for( let file of files ) {
      if( file.match(/\/\./) ) continue; // skip hidden files

      let destFile = path.join(destPath, path.relative(sourcePath, file));
      console.log(`Copying file ${file} to ${destFile}`);
      if( !options.dryRun ) {
        try {
          context = await createContext({file: destFile});
          await cask.write(context, {
            readPath: file,
            replace: options.replace
          });
        } catch (err) {
          console.error(`Failed to copy ${file} to ${destFile}: ${err.message}`);
          console.error(err.stack);
          if( err.details ) {
            console.error(err.details);
          }
          failed.push(file);
        }
      }
    }

    if( failed.length > 0 ) {
      console.log(`\nThe following files failed to copy:`);
      failed.forEach(f => console.log(`  - ${f}`));
    }

    cask.dbClient.end();
    return;
  });

program
  .command('metadata <file-path>')
  .description('Get metadata for a file in the CASKFS')
  .action(async (filePath) => {
    const cask = new CaskFs();
    console.log(await cask.metadata(filePath));
    cask.dbClient.end();
  });

program
  .command('read <file-path>')
  .description('Read a file from the CASKFS and output to stdout')
  .action(async (filePath) => {
    const cask = new CaskFs();
    process.stdout.write(await cask.read(filePath));
    cask.dbClient.end();
  });

program
  .command('rdf')
  .description('Read linked data and output as supported RDF format to stdout')
  .option('-c, --containment <file-path>', 'Only include RDF triples for the specified containment file')
  .option('-s, --subject <subject-uri>', 'Only include RDF triples with the specified subject')
  .option('-o, --object <object-uri>', 'Only include RDF triples with the specified object')
  .option('-g, --graph <graph-uri>', 'Only include RDF triples in the specified graph. Must be used with --subject or --containment')
  .option('-p, --partition <keys>', 'Only include RDF triples with the specified partition keys (comma-separated). Must be used with --subject or --containment')
  .option('-f, --format <format>', 'RDF format to output: jsonld, compact, flattened, expanded, nquads or json. Default is jsonld', 'jsonld')
  .action(async (options) => {
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
  .command('links <file-path>')
  .description('Get links for a file in the CASK FS')
  .option('-p, --predicate <predicate>', 'Only include links with the specified predicate, comma-separated')
  .option('-i, --ignore-predicate <predicate>', 'Only include links that do NOT have the specified predicate(s), comma-separated')
  .option('-k, --partition-keys <keys>', 'Only include links with the specified partition keys (comma-separated)')
  .option('-g, --graph <graph-uri>', 'Only include links in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include links with the specified subject URI')
  .action(async (filePath, options) => {
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

    console.log(await cask.links(filePath, options));
    cask.dbClient.end();
  });

program
  .command('find')
  .description('Get files (containment) that have any of the following:')
  .option('-p, --predicate <predicate>', 'Only include files with the specified predicate')
  .option('-k, --partition-keys <keys>', 'Only include files with the specified partition keys (comma-separated)')
  .option('-g, --graph <graph-uri>', 'Only include files in the specified graph')
  .option('-s, --subject <subject-uri>', 'Only include files with the specified subject URI')
  .option('-o, --object <object-uri>', 'Only include files with the specified object URI')
  .action(async (options) => {
    const cask = new CaskFs();

    if( options.partitionKeys ) {
      options.partitionKeys = options.partitionKeys.split(',').map(k => k.trim());
    }

    console.log(await cask.rdf.find(options));
    cask.dbClient.end();
  });

program
  .command('rm <file-path>')
  .description('Remove a file from the CASKFS and the underlying storage')
  .option('-s, --soft-delete', 'Never delete the file from the underlying storage, even if all references are removed', false)
  .action(async (filePath, options) => {
    const cask = new CaskFs();
    const resp = await cask.delete(filePath, { softDelete: options.softDelete });
    console.log(resp);
    cask.dbClient.end();
  });

program
  .command('ls <directory>')
  .option('-o, --output <output>', 'Output format: text (default) or json', 'text')
  .description('List files in the CASK FS')
  .action(async (directory, options) => {
    let partitionKeys = options.partitionKeys ? options.partitionKeys.split(',').map(k => k.trim()) : undefined;
    const caskfs = new CaskFs();
    const resp = await caskfs.ls({
      directory
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

program
  .command('auto-partition <file-path>')
  .description('Get partition keys for a file in the CASK FS')
  .action(async (filePath) => {
    const cask = new CaskFs();
    console.log(await cask.getPartitionKeysFromPath(filePath));
    cask.dbClient.end();
  });

program
  .command('set-auto-partition')
  .requiredOption('-n, --name <name>', 'Name of the auto-partition rule')
  .option('-p, --position <position>', 'Position in the path to extract the partition key from (1-based index)')
  .option('-f, --filter-regex <regex>', 'Regular expression to filter the partition key')
  .description('Set an auto-partition rule for extracting partition keys from file paths')
  .action(async (options) => {
    let opts = {
      name: options.name,
      index: options.position,
      filterRegex: options.filterRegex
    };

    console.log('Setting auto-partition rule:', options);

    const cask = new CaskFs();
    await cask.setAutoPathPartition(opts);
    cask.dbClient.end();
  });

program
  .command('stats')
  .description('Get statistics about the CASKFS')
  .action(async () => {
    const caskfs = new CaskFs();
    console.log(await caskfs.stats());
    caskfs.dbClient.end();
  });

program
  .command('init-pg')
  .description('Initialize the PostgreSQL database')
  .action(async () => {
    const cask = new CaskFs();
    await cask.dbClient.init();
    cask.dbClient.end();
  });

program.parse(process.argv);
