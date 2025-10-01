import AutoPath from "./base.js";

class AutoPathBucket extends AutoPath {

  constructor(opts={}) {
    super({
      table : 'auto_path_bucket',
      ...opts
    });
  }

  getValue(name, pathValue) {
    return name;
  }

}

export default AutoPathBucket;