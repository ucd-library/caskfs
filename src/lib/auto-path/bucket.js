import AutoPath from "./base.js";

/**
 * @class AutoPathBucket
 * @description Auto-path rule engine that derives a cloud storage bucket name from a file's path.
 */
class AutoPathBucket extends AutoPath {

  /**
   * @param {Object} opts see {@link AutoPath} constructor
   */
  constructor(opts={}) {
    super({
      table : 'auto_path_bucket',
      ...opts
    });
  }

  /**
   * @method getValue
   * @description Default value extractor for bucket rules: the bucket name is simply the rule's name.
   *
   * @param {String} name name of the rule, used directly as the bucket name
   * @param {String} pathValue the matched path segment (unused)
   * @returns {String} the bucket name
   */
  getValue(name, pathValue) {
    return name;
  }

}

export default AutoPathBucket;