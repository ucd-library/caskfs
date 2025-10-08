import {createLogger} from '@ucd-lib/logger';

const loggers = {};

let DEFAULT_LOG_LEVEL = 'error';

function getLogger(name) {
  if( loggers[name] ) return loggers[name];
  loggers[name] = createLogger({
    name,
    noInitMsg : true,
    labelsProperties : ['name']
  });
  return loggers[name];
}

function setLogLevel(level) {
  DEFAULT_LOG_LEVEL = level;
  Object.values(loggers).forEach(logger => logger.setLevel(level));
}

export { getLogger, setLogLevel };