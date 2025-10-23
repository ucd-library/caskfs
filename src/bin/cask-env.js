import { Command } from 'commander';
import environment from '../lib/environment.js';
import { stringify as stringifyYaml } from 'yaml';
import path from 'path';

const program = new Command();

program.command('default-get')
  .description('Get the default environment')
  .action(async () => {
    const env = environment.getDefaultEnv();
    if( !env ) {
      console.log('No default environment set');
      return;
    }
    console.log(stringifyYaml(env));
  });

program.command('default-set <environment>')
  .description('Set the default environment')
  .action(async (envName) => {
    environment.loadEnv(envName); // verify it exists
    environment.setDefaultEnv(envName);
    console.log(`Default environment set to ${envName}`);
  });

program.command('list')
  .description('List all environments')
  .action(async () => {
    environment.loadEnvironments();
    const envs = environment.data.environments || {};

    // remove passwords from output
    for( let envName of Object.keys(envs) ) {
      if( envs[envName].password ) {
        envs[envName].password = '******';
      }
    }

    console.log(stringifyYaml(envs));
  });

program.command('get <environment>')
  .description('Get a specific environment')
  .option('-w, --with-password', 'include password in output')
  .action(async (envName, options) => {
    environment.loadEnv(envName);
    const env = environment.data.environments[envName];
    if( !env ) {
      console.log(`Environment ${envName} not found`);
      return;
    }
    if( !options.withPassword && env.password) {
      env.password = '******';
    }
    console.log(stringifyYaml(env));
  });

program.command('set <environment>')
  .description('Set a specific environment')
  .option('-t, --type <type>', 'environment type (direct-pg or http)')
  .option('-h, --host <host>', 'http or postgres host. For http type, include protocol and port (http://...)')
  .option('-P, --port <port>', 'postgres port (for direct-pg type)')
  .option('-u, --user <user>', 'postgres user (for direct-pg type)')
  .option('-w, --password <password>', 'postgres password (for direct-pg type)')
  .option('-d, --database <database>', 'postgres database name (for direct-pg type)')
  .option('-r, --root-dir <rootDir>', 'CaskFs root directory (for direct-pg type)')
  .option('-c, --client-env <env>', 'CaskFs client environment (for developers)')
  .option('--powerwash-enabled <true|false>', 'Enable or disable powerwash functionality')
  .action(async (envName, options) => {
    let config = {};

    try {
      config = environment.loadEnv(envName); // load existing to preserve any missing fields
    } catch(e) {}

    if( options.type === 'direct-pg' || config.type === 'direct-pg' ) {
      config.type = 'direct-pg';
      config.host = options.host || 'localhost';
      config.port = options.port || 5432;
      config.user = options.user || 'postgres';
      config.password = options.password || 'postgres';
      config.database = options.database || 'postgres';
      if( options.rootDir ) {
        if( !path.isAbsolute(options.rootDir) ) {
          options.rootDir = path.resolve(process.cwd(), options.rootDir);
        }
        config.rootDir = options.rootDir;
      }
    } else if( options.type === 'http' || config.type === 'http' ) {
      config.type = 'http';
      config.host = options.host || 'http://localhost:3000';
    } else {
      throw new Error('Invalid or missing environment type. Must be direct-pg or http');
    }

    if( options.clientEnv ) {
      config.clientEnv = options.clientEnv;
    }

    if( options.powerwashEnabled !== undefined ) {
      config.powerwashEnabled = options.powerwashEnabled === 'true' || options.powerwashEnabled === true;
    }

    environment.saveEnv(envName, config);
    console.log(`Environment ${envName} set`);
  });

program.command('delete <environment>')
  .description('Delete a specific environment')
  .action(async (envName) => {
    environment.removeEnv(envName);
    console.log(`Environment ${envName} deleted`);
  });

program.parse(process.argv);