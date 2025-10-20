import { Command } from 'commander';
import environment from '../lib/environment.js';
import { stringify as stringifyYaml } from 'yaml'

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
  .option('-P, --port <port>', 'http or postgres port')
  .option('-u, --user <user>', 'postgres user')
  .option('-w, --password <password>', 'postgres password')
  .option('-d, --database <database>', 'postgres database name')
  .action(async (envName, options) => {
    let config = {};
    if( options.type === 'direct-pg' ) {
      config.type = 'direct-pg';
      config.host = options.host || 'localhost';
      config.port = options.port || 5432;
      config.user = options.user || 'postgres';
      config.password = options.password || 'postgres';
      config.database = options.database || 'postgres';
    } else if( options.type === 'http' ) {
      config.type = 'http';
      config.host = options.host || 'http://localhost:3000';
    } else {
      throw new Error('Invalid or missing environment type. Must be direct-pg or http');
    }
    environment.saveEnv(envName, config);
    console.log(`Environment ${envName} set`);
  });

program.parse(process.argv);