import { Registry, BaseStore, LruStore, getLogger } from '@ucd-lib/cork-app-utils';
const logger = getLogger('clearCache');

const defaultOpts = { skipModels: ['IconModel', 'AppStateModel'] };

export default (opts={}) => {
  clearCache({ ...defaultOpts, ...opts });
}

/**
 * @description Clear all LruStore caches in all models
 * @param {Object} opts
 * @param {Array} opts.skipModels - list of model names to skip when clearing cache
 */
function clearCache(opts={}){

  logger.info('Clearing cache for all LruStores');

  for (const modelName in Registry.models) {

    if ( opts.skipModels?.includes(modelName) ) {
      logger.debug(`Skipping model: ${modelName}`);
      continue;
    }

    logger.debug(`Clearing cache for model: ${modelName}`);

    const model = Registry.models[modelName];
    
    // bail if model.store is not BaseStore or subclass
    if ( !model.store || !(model.store instanceof BaseStore) ) {
      logger.debug(`No store found for model: ${modelName}`);
      continue;
    }

    // bail if model.store.data is not an object
    if ( typeof model.store.data !== 'object' ) {
      logger.debug(`No data object found for model: ${modelName}`);
      continue;
    }

    for (const storeName in model.store.data) {
      const store = model.store.data[storeName];
      
      // only clear LruStore instances
      if ( !(store instanceof LruStore) ) {
        logger.debug(`Store ${storeName} is not LruStore, skipping`);
        continue;
      }

      store.purge();
      logger.debug(`Cleared LruStore: ${storeName}`);
    }
  }

}