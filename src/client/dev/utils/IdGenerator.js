/**
 * @description Utility class for generating unique ids/nonces
 */
export default class IdGenerator {

  constructor(opts={}){
    this.autoIncrement = Number.isInteger(opts?.autoIncrement) ? opts.autoIncrement : 1;
    this.map = new Map();

    if ( opts.prefix ){
      this.prefix = opts.prefix;
    } else {
      this.prefix = `${IdGenerator.getRand('r')}--`;
    }
  }

  static getRand(prefix=''){
    return `${prefix}${Math.random().toString(36).substring(2)}`;
  }

  get(key){
    if ( key && this.map.has(key) ) {
      return this.map.get(key);
    }
    let id = this.autoIncrement++;
    if ( this.prefix ) id = `${this.prefix}${id}`;
    if ( key ) this.map.set(key, id);
    return id;
  }
}
