/**
 * @description Utility for managing controllers on custom elements.
 */
class ControllerUtils {

  /**
   * @description Add a controller to a host element and keep track of it for retrieval later
   * @param {LitElement} host - The host element to add the controller to
   * @param {Object} controller - The controller instance to add to the host
   */
  addController(host, controller){
    host.addController(controller);
    if ( !host._caskControllers ) host._caskControllers = [];
    host._caskControllers.push(controller);
  }

  /**
   * @description Get a controller of a specific type from a host element
   * @param {LitElement} host - The host element to search for the controller
   * @param {Function|string} controllerClass - The class of the controller to retrieve
   * @param {Object} opts - Options for retrieving the controller
   * @param {boolean} opts.noError - If true, return null instead of throwing an error if the controller is not found
   * @returns {Object|null} - The controller instance or null if not found
   */
  getController(host, controllerClass, opts={}){
    const className = typeof controllerClass === 'string' ? controllerClass : controllerClass.name;
    const errorMsg = `Controller of type ${className} not found on host element`;
    if ( !host._caskControllers ) {
      if ( opts.noError ) return null;
      throw new Error(errorMsg);
    }
    for ( const ctl of host._caskControllers ) {
      if ( ctl.constructor.name === className ) return ctl;
    }
    if ( opts.noError ) return null;
    throw new Error(errorMsg);
  }
}

export default new ControllerUtils();