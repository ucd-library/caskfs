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
  if( gOpts.env ) {
    opts.environment = {name: gOpts.env};
    environment.loadEnv(gOpts.env);
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
  if( gOpts.impersonate ) {
    opts.requestor = gOpts.impersonate;
  } else if( gOpts.publicUser ) {
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