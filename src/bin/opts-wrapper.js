import { program } from 'commander';
import os from 'os';

let programInstance = null;
let optsWrapper = (program) => {
  programInstance = program;
  program
    .option('-i, --impersonate <user>', 'user to run to command as')
    .option('-p, --public-user', 'run as public user')
}

let handleUser = (opts) => {
  let gOpts = programInstance.opts();
  if( gOpts.impersonate ) {
    opts.user = gOpts.impersonate;
  } else if( gOpts.publicUser ) {
    opts.user = null;
  } else {
    opts.user = os.userInfo().username;
  }
}

export {optsWrapper, handleUser};