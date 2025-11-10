/**
 * @description Very simple request data validator for API requests
 */
export class Validator {

  /**
   * @description Create a new Validator
   * @param {Object} schema - validation schema
   * @param {string} schema.[field].type - type of field: string, integer, positiveInteger, positiveIntegerOrZero, boolean
   * @param {boolean} schema.[field].multiple - whether multiple values are allowed (comma-separated strings or arrays)
   */
  constructor( schema={} ){
    this.schema = schema;
    this.errors = [];
    this.errorCodes = {
      INTEGER: { code: 'INTEGER', message: 'Expected integer value' },
      POSITIVE_INTEGER: { code: 'POSITIVE_INTEGER', message: 'Expected positive integer value' },
      POSITIVE_INTEGER_OR_ZERO: { code: 'POSITIVE_INTEGER_OR_ZERO', message: 'Expected positive integer or zero value' },
      BOOLEAN: { code: 'BOOLEAN', message: 'Expected boolean value' }
    };

    this.results = {};
  }
  validate( data={} ){
    this.errors = [];
    const out = {};
    
    for( const [ key, rules ] of Object.entries(this.schema) ){

      try {
        let value = data[key];

        if ( value === undefined || value === null ){
          continue;
        }

        // multiple values allowed
        if ( rules.multiple && typeof value === 'string' ){
          value = value.split(',').map( s => s.trim() );
        } else if ( rules.multiple && !Array.isArray(value) ){
          value = [ value ];
        }

        // type coercion
        if ( rules.type === 'integer' || rules.type === 'positiveInteger' || rules.type === 'positiveIntegerOrZero' ){
          if ( rules.multiple ){
            value = value.map( v => {
              return this.validateInteger( v, rules.type === 'positiveInteger', rules.type === 'positiveIntegerOrZero' );
            });
          } else {
            value = this.validateInteger( value, rules.type === 'positiveInteger', rules.type === 'positiveIntegerOrZero' );
          }
        }

        if ( rules.type === 'boolean' ){
          if ( rules.multiple ){
            value = value.map( v => this.validateBoolean( v ));
          } else {
            value = this.validateBoolean( value );
          }
        }

        out[key] = value;

      } catch(e){
        const details = { field: key, value: data[key] };
        if ( e instanceof SingleValidationError ){
          details.code = e.error.code;
        }
        this.errors.push( details );
      }
    }

    if ( this.errors.length > 0 ){
      throw new ApiValidationError( this.errors.map( e => ({
        field: e.field,
        value: e.value,
        code: e.code,
        message: e.code ? this.errorCodes[e.code].message : 'Validation error'
      })));
    }

    return out;
  }

  validateInteger( value, positive=false, allowZero=false ){
    const iv = parseInt(value, 10);
    if ( isNaN(iv) ) {
      throw new SingleValidationError( this.errorCodes.INTEGER );
    }
    if ( allowZero && iv === 0 ){
      return iv;
    }
    if ( positive && iv <= 0 ){
      throw new SingleValidationError( this.errorCodes.POSITIVE_INTEGER );
    }
    return iv;
  }

  validateBoolean( value ){
    if ( value === true || value === 'true' || value === 1 || value === '1' ){
      return true;
    } else if ( value === false || value === 'false' || value === 0 || value === '0' ){
      return false;
    } else {
      throw new SingleValidationError( this.errorCodes.BOOLEAN );
    }
  }

}

class SingleValidationError extends Error {
  constructor ( error ) {
    super( error.message );
    this.error = error;
    this.name = 'SingleValidationError';
  }
}

export class ApiValidationError extends Error {
  constructor(errors){
    super('Validation errors occurred');
    this.name = 'ApiValidationError';
    this.errors = errors;
  }
}
