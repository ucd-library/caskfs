import os from 'os';
import environment from '../lib/environment.js';

let programInstance = null;
let optsWrapper = (program) => {
  programInstance = program;
  program
    .option('-i, --impersonate <user>', 'user to run to command as')
    .option('-p, --public-user', 'run as public user')
    .option('-e, --env <environment>', 'environment to use for the command');
}

let handleEnv = (opts) => {
  let gOpts = programInstance.opts();
  // Fall back to env var set by the parent cask process for external subcommands.
  const envName = gOpts.env || process.env.CASKFS_ENV_OVERRIDE;
  if( envName ) {
    const config = environment.loadEnv(envName);
    opts.environment = { name: envName, config };
  } else {
    opts.environment = environment.getDefaultEnv();
    if( opts.environment ) {
      environment.loadEnv(opts.environment.name);
    }
  }
  return opts;
}

let handleUser = (opts) => {
  let gOpts = programInstance.opts();
  // Fall back to env vars set by the parent cask process when this file
  // is running as an external subcommand (e.g. cask-acl, cask-auto-path).
  const impersonate = gOpts.impersonate || process.env.CASKFS_IMPERSONATE;
  const publicUser  = gOpts.publicUser  || process.env.CASKFS_PUBLIC_USER === 'true';
  if( impersonate ) {
    opts.requestor = impersonate;
  } else if( publicUser ) {
    opts.requestor = null;
  } else {
    opts.requestor = os.userInfo().username;
  }
  return opts;
}

let handleGlobalOpts = (opts) => {
  opts = handleEnv(opts);
  opts = handleUser(opts);
  return opts;
}

export {optsWrapper, handleUser, handleEnv, handleGlobalOpts};