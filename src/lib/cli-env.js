import fs from 'fs';
import path from 'path';
import os from 'os';
import config from './config.js';

let homeDir = os.homedir();
let envFile = path.join(homeDir, config.cliEnvFile);
let env = {
  active: null,
  environments : {}
}

function load() {
  if (fs.existsSync(envFile)) {
    env = JSON.parse(fs.readFileSync(envFile, 'utf-8'));
  }
  return env;
}

function save(newEnv) {
  fs.writeFileSync(envFile, JSON.stringify(newEnv, null, 2), 'utf-8');
}

function setActive(name) {
  if( !env.environments[name] ) {
    throw new Error(`Environment ${name} does not exist`);
  }
  env.active = name;
  save(env);
}

function addEnvironment(name, settings) {
  env.environments[name] = settings;
  if( !env.active ) {
    env.active = name;
  }
  save(env);
}

function removeEnvironment(name) {
  if( env.active === name ) {
    env.active = null;
  }
  delete env.environments[name];
  save(env);
}

function getActive() {
  if( !env.active ) {
    return null;
  }
  return env.environments[env.active];
}

export default {
  load,
  save,
  setActive,
  addEnvironment,
  removeEnvironment,
  getActive,
  data: () => env
}