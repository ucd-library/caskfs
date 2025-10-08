import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../../lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class WebpackUtils {

  constructor(){
    this.publicDir = path.join(__dirname, '../public');
    this.root = __dirname;
    this.entry = path.join(__dirname, '../dev/index.js');
    this.bundleName = config.webapp.bundleName;
    this.clientModules = [];
  }

  jsDir(isDist){
    return path.join(this.publicDir, 'js', isDist ? 'dist' : 'dev');
  }

  removeJsDir(isDist){
    const jsDir = this.jsDir(isDist);
    if (fs.existsSync(jsDir)) {
      fs.rmSync(jsDir, { recursive: true, force: true });
    }
  }

  addCssLoader(config){
    let cssModule = config.module.rules.find(rule => {
    if( !Array.isArray(rule.use) ) return false;
      return rule.use.includes('css-loader');
    });

    let mindex = cssModule.use.indexOf('css-loader');
    cssModule.use[mindex] = {
      loader: 'css-loader',
      options: {
        url : false
      }
    }
  }

}

export default new WebpackUtils();
