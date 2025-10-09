import os from 'os';

let optsWrapper = (program) => {
  program
    .option('-i, --impersonate <user>', 'user to run to command as')
    .option('-u, --user', 'run as system account user')
}

let handleUser = (opts) => {
  if( opts.user === true ) {
    opts.user = os.userInfo().username;
  }
  if( opts.impersonate ) {
    opts.user = opts.impersonate;
  }
}

export {optsWrapper, handleUser};