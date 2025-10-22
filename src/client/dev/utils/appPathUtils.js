import config from '../config.js';

export class AppPathUtils {
  constructor(basePath){
    this.basePath = basePath === '/' ? '' : basePath;
    this.basePathParts = basePath.split('/').filter(d => d);
  }

  relativePath(path, opts={}){
    const returnArray = opts.returnArray || false;

    if ( typeof path === 'string' ) {
      path = path.split('/').filter(d => d);
    }

    if ( !path ) {
      return returnArray ? [] : '/';
    }

    const relativePath = path.slice(this.basePathParts.length);
    return returnArray ? relativePath : '/' + relativePath.join('/');
  }

  fullPath(path, opts={}) {
    const returnArray = opts.returnArray || false;
    const noLeadingSlash = opts.noLeadingSlash || false;

    if ( typeof path === 'string' ) {
      path = path.split('/').filter(d => d);
    }

    if ( !path ) {
      return returnArray ? this.basePathParts : (noLeadingSlash ? '' : '/') + this.basePathParts.join('/');
    }

    const fullPath = [...this.basePathParts, ...path];
    return returnArray ? fullPath : (noLeadingSlash ? '' : '/') + fullPath.join('/');
  }
}

const appPathUtils = new AppPathUtils(config.basePath);
export default appPathUtils;