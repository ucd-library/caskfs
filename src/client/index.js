import express from 'express';
import config from '../lib/config.js';
import apiRoutes from '../controllers/index.js';
import staticRoutes from './controllers/static.js';
import logger from './logger.js';
import {logReqMiddleware} from '@ucd-lib/logger';

/**
 * @function caskRouter
 * @description Returns an Express Router with all CaskFS routes and middleware mounted.
 *
 * @param {Object} opts
 * @param {Boolean} [opts.disableWebApp=false] - If true, disables mounting of static SPA routes.
 * @param {Boolean} [opts.logRequests=false] - If true, enables request logging middleware.
 * @returns {express.Router}
 */
function caskRouter(opts = {}) {
  const router = express.Router();

  // Capture base path to determine where the app is mounted
  router.use((req, res, next) => {
    if (!req.caskBasePath) {
      req.caskBasePath = req.baseUrl || '/';
    }
    next();
  });

  if ( opts.logRequests ) {
    router.use(logReqMiddleware(logger));
  }
  router.use('/api', apiRoutes);

  if ( !opts.disableWebApp ) {
    staticRoutes(router);
  }

  return router;
}

/**
 * @function startServer
 * @description Starts the CaskFS web server
 * @param {Object} opts
 * @param {Number} [opts.port] - Port to run the server on. Defaults to config.webapp.port
 * @param {String} [opts.basepath] - Basepath to mount the CaskFS router at. Defaults to config.webapp.basepath or '/'
 * @param {Boolean} [opts.disableWebApp=false] - If true, disables mounting of static SPA routes.
 * @param {Boolean} [opts.logRequests=true] - If true, enables request logging middleware.
 */
function startServer(opts = {}) {
  const app = express();
  const port = opts.port || config.webapp.port;
  const basepath = opts.basepath || config.webapp.basepath || '/';
  const disableWebApp = opts.disableWebApp || false;
  const logRequests = opts.logRequests === undefined ? true : opts.logRequests;

  app.use(basepath, caskRouter({ disableWebApp, logRequests }));

  app.listen(port, () => {
    logger.info(`CaskFs web application running on port ${port}`);
    logger.info(`Mounted at basepath: ${basepath}`);
    logger.info(`Web application ${disableWebApp ? 'disabled' : 'enabled'}`);
    logger.info(`Request logging ${logRequests ? 'enabled' : 'disabled'}`);
  });
}

export { startServer, caskRouter };

// Start the server if this file is run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startServer();
}
