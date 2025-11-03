import config from '../config.js';

/**
 * @description Utility class for handling paths with respect to the application base path.
 */
export class AppPathUtils {
  constructor(basePath){
    this.basePath = basePath === '/' ? '' : basePath;
    this.basePathParts = basePath.split('/').filter(d => d);
  }

  /**
   * @description Extract the relative path from a full path, removing the application base path
   * @param {String|Array} path - The full path as a string or an array of path segments
   * @param {Object} opts - Options object
   * @param {Boolean} opts.returnArray - If true, returns the path as an array of segments
   * @returns {String|Array} - The relative path as a string or an array of segments
   */
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

  /**
   * @description Construct the full path by prepending the application base path
   * @param {String|Array} path - The relative path as a string or an array of path segments
   * @param {Object} opts - Options object
   * @param {Boolean} opts.returnArray - If true, returns the path as an array of segments
   * @param {Boolean} opts.noLeadingSlash - If true, the returned string will not have a leading slash
   * @returns {String|Array} - The full path as a string or an array of segments
   */
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