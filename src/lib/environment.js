import fs from 'fs';
import path from 'path';
import os from 'os';
import config from './config.js';

class LibraryEnvironment {

  constructor(opts={}) {
    this.TYPES = ['direct-pg', 'http'];
    this.environmentFile = opts.environmentFile || path.join(os.homedir(), '.caskfs', 'environments.json');
    this.data = {};

    this.PROPERTIES = {
      http : ['host'],
      'direct-pg' : ['host', 'port', 'user', 'password', 'database']
    };
  }

  loadEnvironments() {
    if (!fs.existsSync(this.environmentFile)) {
      this.data = {
        environments: {},
        defaultEnvironment: null
      };
      return this.data;
    }
    const data = fs.readFileSync(this.environmentFile, 'utf-8');
    this.data = JSON.parse(data);
    return this.data;
  }

  saveEnvironments(environments) {
    this.data = environments;
    fs.mkdirSync(path.dirname(this.environmentFile), { recursive: true });
    fs.writeFileSync(this.environmentFile, JSON.stringify(this.data, null, 2));
  }

  loadEnv(name) {
    this.loadEnvironments();

    if( !this.data.environments ) {
      this.data.environments = {};
    }

    if( !this.data.environments[name]) {
      throw new Error(`Environment ${name} not found`);
    }

    let env = this.data.environments[name];

    if( !this.TYPES.includes(env.type) ) {
      throw new Error(`Environment ${name} has invalid type ${env.type}`);
    }

    if( env.type === 'direct-pg' ) {
      for( let key of this.PROPERTIES['direct-pg'] ) {
        if( env[key] !== undefined ) {
          config.postgres[key] = env[key];
        }
      }
      if( env.rootDir ) {
        config.rootDir = env.rootDir;
      }
      if( env.powerwashEnabled !== undefined ) {
        config.powerwashEnabled = env.powerwashEnabled;
      }
    } else if( env.type === 'http' ) {
      for( let key of this.PROPERTIES['http'] ) {
        if( env[key] !== undefined ) {
          config.webapp[key] = env[key];
        }
      }
    }

    return env;
  }

  removeEnv(name) {
    this.loadEnvironments();
    if( this.data.environments[name] ) {
      delete this.data.environments[name];
      if( this.data.defaultEnvironment === name ) {
        this.data.defaultEnvironment = null;
      }
      this.saveEnvironments(this.data);
    }
  }

  saveEnv(name, env) {
    this.loadEnvironments();
    this.data.environments[name] = env;
    if( !this.data.defaultEnvironment ) {
      this.data.defaultEnvironment = name;
    }
    this.saveEnvironments(this.data);
  }

  getDefaultEnvName() {
    this.loadEnvironments();
    return this.data.defaultEnvironment || null;
  }

  exists() {
    let fileExists = fs.existsSync(this.environmentFile);
    if( !fileExists ) {
      return {fileExists: false, environmentsExist: false, defaultEnvExists: false};
    }

    this.loadEnvironments();

    let environmentsExist = this.data.environments && Object.keys(this.data.environments).length > 0;
    let defaultEnvExists = environmentsExist && this.data.defaultEnvironment && this.data.environments[this.data.defaultEnvironment];

    return {
      fileExists: true,
      environmentsExist: environmentsExist,
      defaultEnvExists: defaultEnvExists
    };
  }

  getDefaultEnv() {
    let exists = this.exists();
    if( !exists.fileExists || !exists.environmentsExist ) {
      return null;
    }
    if( !exists.defaultEnvExists ) {
      let firstKey = Object.keys(this.data.environments)[0];
      return {name: firstKey, config: this.data.environments[firstKey]};
    }
    return {
      name: this.data.defaultEnvironment,
      config: this.data.environments[this.data.defaultEnvironment]
    };
  }

}

export default new LibraryEnvironment();