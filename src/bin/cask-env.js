import { Command } from 'commander';
import environment from '../lib/environment.js';
import { stringify as stringifyYaml } from 'yaml';
import path from 'path';

const program = new Command();

/**
 * @function maskEnv
 * @description Return a shallow copy of an environment config with sensitive fields masked.
 * @param {Object} env - Environment config
 * @returns {Object}
 */
function maskEnv(env) {
  const masked = { ...env };
  if (masked.password) masked.password = '******';
  if (masked.token) masked.token = '******';
  return masked;
}

// cask env — no subcommand: list all environments, marking the default
program.action(() => {
  environment.loadEnvironments();
  const envs = environment.data.environments || {};
  const defaultName = environment.data.defaultEnvironment;

  if (Object.keys(envs).length === 0) {
    console.log('No environments configured. Use `cask env set <name>` to create one.');
    return;
  }

  for (const [name, cfg] of Object.entries(envs)) {
    const marker = name === defaultName ? '* ' : '  ';
    const typeStr = cfg.type === 'http'
      ? `http  ${cfg.host}${cfg.path || '/api'}`
      : `direct-pg  ${cfg.host}:${cfg.port || 5432}/${cfg.database || 'postgres'}`;
    console.log(`${marker}${name}  (${typeStr})`);
  }
  if (defaultName) {
    console.log(`\nDefault: ${defaultName}  (switch with \`cask env default <name>\`)`);
  }
});

/**
 * cask env default [name]
 * With no arg: show current default.
 * With name: set as new default.
 */
program.command('default [name]')
  .alias('activate')
  .description('Get or set the default environment')
  .action((name) => {
    if (!name) {
      const env = environment.getDefaultEnv();
      if (!env) {
        console.log('No default environment set.');
        return;
      }
      console.log(`${env.name}`);
      console.log(stringifyYaml(maskEnv(env.config)));
      return;
    }
    environment.setDefaultEnv(name);
    console.log(`Default environment set to: ${name}`);
  });

program.command('list')
  .description('List all environments (alias for `cask env` with no subcommand)')
  .action(() => {
    environment.loadEnvironments();
    const envs = environment.data.environments || {};
    const defaultName = environment.data.defaultEnvironment;

    if (Object.keys(envs).length === 0) {
      console.log('No environments configured.');
      return;
    }
    console.log(stringifyYaml(
      Object.fromEntries(
        Object.entries(envs).map(([k, v]) => [k === defaultName ? `* ${k}` : k, maskEnv(v)])
      )
    ));
  });

program.command('get <environment>')
  .description('Show a specific environment')
  .option('-w, --with-password', 'include password/token in output')
  .action((envName, options) => {
    environment.loadEnv(envName);
    const env = environment.data.environments[envName];
    if (!env) {
      console.log(`Environment "${envName}" not found`);
      return;
    }
    console.log(stringifyYaml(options.withPassword ? env : maskEnv(env)));
  });

program.command('set <environment>')
  .description('Create or update an environment')
  .option('-t, --type <type>', 'environment type: direct-pg or http')
  .option('-h, --host <host>', 'server host including protocol (http) or hostname only (direct-pg)')
  .option('--path <path>', 'API path prefix on the server (http only, default: /api)')
  .option('-P, --port <port>', 'postgres port (direct-pg only)', parseInt)
  .option('-u, --user <user>', 'postgres user (direct-pg only)')
  .option('-w, --password <password>', 'postgres password (direct-pg only)')
  .option('-d, --database <database>', 'postgres database name (direct-pg only)')
  .option('-r, --root-dir <rootDir>', 'CaskFS root directory (direct-pg only)')
  .option('--token <token>', 'bearer token for authentication (http only)')
  .option('-c, --client-env <env>', 'CaskFS client environment flag (dev/prod)')
  .option('--powerwash-enabled <bool>', 'enable or disable powerwash (direct-pg only)')
  .action((envName, options) => {
    // Load existing config to preserve fields not being updated
    let config = {};
    try {
      config = environment.loadEnv(envName);
    } catch(e) {}

    const resolvedType = options.type || config.type;

    if (resolvedType === 'direct-pg') {
      config.type = 'direct-pg';
      if (options.host !== undefined)     config.host     = options.host;
      if (options.port !== undefined)     config.port     = options.port;
      if (options.user !== undefined)     config.user     = options.user;
      if (options.password !== undefined) config.password = options.password;
      if (options.database !== undefined) config.database = options.database;
      if (options.rootDir !== undefined) {
        config.rootDir = path.isAbsolute(options.rootDir)
          ? options.rootDir
          : path.resolve(process.cwd(), options.rootDir);
      }
      if (options.powerwashEnabled !== undefined) {
        config.powerwashEnabled = options.powerwashEnabled === 'true' || options.powerwashEnabled === true;
      }
    } else if (resolvedType === 'http') {
      config.type = 'http';
      if (options.host  !== undefined) config.host  = options.host;
      if (options.path  !== undefined) config.path  = options.path;
      if (options.token !== undefined) config.token = options.token;
    } else {
      console.error(`Error: --type is required and must be "direct-pg" or "http" when creating a new environment as '${envName}' does not exist.`);
      process.exit(1);
    }

    if (options.clientEnv !== undefined) config.clientEnv = options.clientEnv;

    environment.saveEnv(envName, config);
    console.log(`Environment "${envName}" saved.`);
  });

program.command('create [environment]')
  .description('Interactively create or update an environment')
  .action(async (envName) => {
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    /**
     * @function ask
     * @description Prompt the user for input, showing an optional default value.
     * Returns the default when the user presses Enter without typing anything.
     * @param {String} question - Prompt text
     * @param {String} [defaultValue] - Value to use when input is empty
     * @returns {Promise<String>}
     */
    const ask = (question, defaultValue) => new Promise(resolve => {
      const hint = defaultValue !== undefined ? ` [${defaultValue}]` : '';
      rl.question(`${question}${hint}: `, answer => {
        const val = answer.trim();
        resolve(val !== '' ? val : (defaultValue ?? ''));
      });
    });

    /**
     * @function askSecret
     * @description Prompt for a sensitive value. Input is not echoed back.
     * @param {String} question - Prompt text
     * @param {String} [defaultValue] - Value to use when input is empty
     * @returns {Promise<String>}
     */
    const askSecret = (question, defaultValue) => new Promise(resolve => {
      const hint = defaultValue !== undefined ? ' [****]' : '';
      process.stdout.write(`${question}${hint}: `);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      const onData = (ch) => {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input !== '' ? input : (defaultValue ?? ''));
        } else if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(1);
        } else if (ch === '\u007f') {
          if (input.length > 0) input = input.slice(0, -1);
        } else {
          input += ch;
        }
      };
      process.stdin.on('data', onData);
    });

    try {
      console.log('\nCreate / update a CaskFS environment\n');

      // Environment name
      if (!envName) {
        envName = await ask('Environment name');
        if (!envName) {
          console.error('Environment name is required.');
          rl.close();
          process.exit(1);
        }
      }

      // Load existing config so we can show current values as defaults
      let existing = {};
      try { existing = environment.loadEnv(envName); } catch(e) {}

      // Type selection
      const currentType = existing.type || 'direct-pg';
      const typeInput = await ask(`Type (direct-pg / http)`, currentType);
      const type = typeInput === 'http' ? 'http' : 'direct-pg';

      let config = { type };

      if (type === 'http') {
        config.host = await ask('Server host (e.g. http://localhost:3000)', existing.host || '');
        config.path = await ask('API path prefix', existing.path || '/api');

        const hasToken = !!existing.token;
        const setToken = await ask('Set bearer token? (yes / no)', hasToken ? 'yes' : 'no');
        if (setToken.toLowerCase().startsWith('y')) {
          config.token = await askSecret('Bearer token', existing.token);
        } else if (hasToken) {
          config.token = existing.token;
        }

      } else {
        config.host     = await ask('Postgres host',     existing.host     || 'localhost');
        config.port     = parseInt(await ask('Postgres port',     String(existing.port     || 5432)));
        config.user     = await ask('Postgres user',     existing.user     || 'postgres');
        config.password = await askSecret('Postgres password', existing.password || 'postgres');
        config.database = await ask('Postgres database', existing.database || 'postgres');
        config.rootDir  = await ask('CaskFS root directory', existing.rootDir || '/opt/caskfs');
      }

      rl.close();

      environment.saveEnv(envName, config);
      console.log(`\nEnvironment "${envName}" saved.`);

      // Offer to set as default
      const current = environment.getDefaultEnvName();
      if (current !== envName) {
        // readline is closed, use a simple prompt via stdout/stdin
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => {
          rl2.question(`Set "${envName}" as the default environment? (yes / no) [yes]: `, answer => {
            rl2.close();
            if (answer.trim().toLowerCase() !== 'no') {
              environment.setDefaultEnv(envName);
              console.log(`Default environment set to "${envName}".`);
            }
            resolve();
          });
        });
      }

    } catch(e) {
      rl.close();
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });


program.command('delete <environment>')
  .description('Delete an environment')
  .action((envName) => {
    environment.removeEnv(envName);
    console.log(`Environment "${envName}" deleted.`);
  });

program.parse(process.argv);
