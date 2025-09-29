import {createLogger} from '@ucd-lib/logger';

const loggers = {};

function getLogger(name) {
  if( loggers[name] ) return loggers[name];
  loggers[name] = createLogger({
    name,
    noInitMsg : true,
    labelsProperties : ['name']
  });
  return loggers[name];
}

export default getLogger;