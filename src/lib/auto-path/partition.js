import AutoPath from "./base.js";

class AutoPathPartition extends AutoPath {

  constructor(opts={}) {
    super({
      table : 'auto_path_partition',
      ...opts
    });
  }

  getValue(name, pathValue) {
    return name+'-'+pathValue;
  }

}

export default AutoPathPartition;