import {createLogger} from '@ucd-lib/logger';
import config from './config.js';

const loggers = {};

function getLogger(name) {
  if( loggers[name] ) return loggers[name];
  loggers[name] = createLogger({
    name,
    noInitMsg : true,
    labelsProperties : ['name'],
    level: config.logLevel
  });
  return loggers[name];
}

function setLogLevel(level) {
  config.logLevel = level;
  Object.values(loggers).forEach(logger => logger.level = level);
}

function silenceLoggers() {
  setLogLevel('fatal');
}

export { getLogger, setLogLevel, silenceLoggers };