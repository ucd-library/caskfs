import { Command } from 'commander';
import CaskFs from '../index.js';

const program = new Command();

const types = ['bucket', 'partition'];

program
  .command('test <type> <file-path>')
  .description(`Test auto-path extraction for a given file path. Type is either; ${types.join(', ')}`)
  .action(async (type, filePath) => {
    const cask = new CaskFs();
    if (!types.includes(type)) {
      console.error(`Invalid type "${type}". Must be one of: ${types.join(', ')}`);
      cask.dbClient.end();
      return;
    }
    console.log(await cask.authPath[type].getFromPath(filePath));
    cask.dbClient.end();
  });

program
  .command('set')
  .argument('<type>', `Type of auto-path rule to set. Must be one of: ${types.join(', ')}`)
  .argument('<name>', 'Name of the auto-path rule')
  .option('-p, --position <position>', 'Position in the path to extract the partition key from (1-based index)')
  .option('-f, --filter-regex <regex>', 'Regular expression to filter the partition key')
  .option('-v, --get-value <js>', 'JavaScript function to transform the extracted value. Function signature: (name, pathValue, regexMatch) => string')
  .description('Set an auto-partition rule for extracting partition keys from file paths')
  .action(async (type, name, options) => {

    if( !options.position && !options.filterRegex ) {
      console.error('Either --position or --filter-regex is required');
      return;
    }

    let opts = {
      name: name,
      index: options.position,
      filterRegex: options.filterRegex,
      getValue: options.getValue
    };

    console.log('Setting auto-path rule:', options);

    const cask = new CaskFs();
    await cask.authPath[type].set(opts);
    cask.dbClient.end();
  });

program
  .command('remove')
  .argument('<type>', `Type of auto-path rule to remove. Must be one of: ${types.join(', ')}`)
  .argument('<name>', 'Name of the auto-path rule to remove')
  .description('Remove an auto-path rule')
  .action(async (type, name) => {
    const cask = new CaskFs();
    await cask.authPath[type].remove(name);
    cask.dbClient.end();
  });

program
  .command('list <type>')
  .description(`List all auto-path rules of a given type. Type is either; ${types.join(', ')}`)
  .action(async (type) => {
    const cask = new CaskFs();
    if (!types.includes(type)) {
      console.error(`Invalid type "${type}". Must be one of: ${types.join(', ')}`);
      cask.dbClient.end();
      return;
    }
    console.table(await cask.authPath[type].getConfig(true));
    cask.dbClient.end();
  });

program.parse(process.argv);