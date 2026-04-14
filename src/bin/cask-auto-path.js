import { Command } from 'commander';
import {optsWrapper, handleGlobalOpts} from './opts-wrapper.js';
import { getClient, endClient, assertDirectPg } from './lib/client.js';
import cliProgress from 'cli-progress';

const program = new Command();
optsWrapper(program);

const types = ['bucket', 'partition'];

program
  .command('test <type> <file-path>')
  .description(`Test auto-path extraction for a given file path. Type is either; ${types.join(', ')}`)
  .action(async (type, filePath, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'auto-path test');

    if (!types.includes(type)) {
      console.error(`Invalid type "${type}". Must be one of: ${types.join(', ')}`);
      await endClient(cask);
      return;
    }
    console.log(await cask.autoPath[type].getFromPath(filePath));
    await endClient(cask);
  });

program
  .command('load <file-path>')
  .description('Load auto-path rules from a JSON file')
  .action(async (filePath, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'auto-path load');

    await cask.loadAutoPathRulesFromFile(filePath);
    await endClient(cask);
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
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'auto-path set');

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

    if( Object.keys(cask.autoPath).indexOf(type) === -1 ) {
      console.error(`Invalid type "${type}". Must be one of: ${types.join(', ')}`);
      await endClient(cask);
      return;
    }

    let pbar;
    opts.cb = ({total, completed}) => {
      if( !pbar ) {
        pbar = new cliProgress.Bar(
          {etaBuffer: 50},
          cliProgress.Presets.shades_classic
        );
        pbar.start(total, completed);
        return;
      }

      pbar.update(completed);
    };

    await cask.autoPath[type].set(opts);
    await endClient(cask);

    console.log('Auto-path rule set successfully');
  });

program
  .command('remove')
  .argument('<type>', `Type of auto-path rule to remove. Must be one of: ${types.join(', ')}`)
  .argument('<name>', 'Name of the auto-path rule to remove')
  .description('Remove an auto-path rule')
  .action(async (type, name, options={}) => {
    handleGlobalOpts(options);

    if (!types.includes(type)) {
      console.error(`Invalid type "${type}". Must be one of: ${types.join(', ')}`);
      return;
    }

    const cask = getClient(options);
    assertDirectPg(cask, 'auto-path remove');
    await cask.autoPath[type].remove(name);
    await endClient(cask);
  });

program
  .command('list <type>')
  .description(`List all auto-path rules of a given type. Type is either; ${types.join(', ')}`)
  .action(async (type, options={}) => {
    handleGlobalOpts(options);
    const cask = getClient(options);
    assertDirectPg(cask, 'auto-path list');

    if (!types.includes(type)) {
      console.error(`Invalid type "${type}". Must be one of: ${types.join(', ')}`);
      await endClient(cask);
      return;
    }
    console.table(await cask.autoPath[type].getConfig(true));
    await endClient(cask);
  });

program.parse(process.argv);
