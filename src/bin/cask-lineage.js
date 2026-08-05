import { Command } from 'commander';
import { optsWrapper, handleGlobalOpts } from './opts-wrapper.js';
import { getClient, endClient } from './lib/client.js';

const program = new Command();
optsWrapper(program);

program
  .command('add <file-path> <source-path>')
  .description('Record that file-path was derived from source-path (e.g. a silver file derived from a bronze file)')
  .option('-r, --relation <uri>', 'Relation URI', 'http://schema.org/source')
  .option('-m, --metadata <text>', 'Free-form text carried alongside the link (e.g. a job/run id)')
  .action(async (filePath, sourcePath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const result = await cask.addDerivativeLink(
      { filePath, requestor: options.requestor },
      { sourcePath, relation: options.relation, metadata: options.metadata }
    );

    console.log(result);
    await endClient(cask);
  });

program
  .command('remove <file-path> <source-path>')
  .description('Remove a derivative link between file-path and source-path')
  .option('-r, --relation <uri>', 'Relation URI', 'http://schema.org/source')
  .action(async (filePath, sourcePath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    await cask.removeDerivativeLink(
      { filePath, requestor: options.requestor },
      { sourcePath, relation: options.relation }
    );

    console.log(`Removed lineage link: ${filePath} -> ${sourcePath}`);
    await endClient(cask);
  });

program
  .command('derivatives <file-path>')
  .description('List files that were derived from file-path (file-path is the source)')
  .option('-r, --relation <uri>', 'Filter by relation URI')
  .action(async (filePath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const result = await cask.getDerivatives(
      { filePath, requestor: options.requestor },
      { relation: options.relation }
    );

    console.log(result);
    await endClient(cask);
  });

program
  .command('sources <file-path>')
  .description('List the files file-path was derived from (its lineage ancestors, one hop)')
  .option('-r, --relation <uri>', 'Filter by relation URI')
  .action(async (filePath, options) => {
    handleGlobalOpts(options);
    const cask = getClient(options);

    const result = await cask.getSources(
      { filePath, requestor: options.requestor },
      { relation: options.relation }
    );

    console.log(result);
    await endClient(cask);
  });

program.parse(process.argv);
