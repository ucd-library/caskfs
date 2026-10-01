import express from 'express';
import config from '../lib/config.js';
import apiRoutes from '../controllers/index.js';
import staticRoutes from './controllers/static.js';
import logger from './logger.js';
import {logReqMiddleware} from '@ucd-lib/logger';
import headerAuthMiddleware from '../lib/middleware/header-auth.js';
import impersonationMiddleware from '../lib/middleware/impersonation.js';

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

  if ( config.headerAuth.enabled ) {
    router.use(headerAuthMiddleware);
  }

  // Always mounted; the middleware itself no-ops unless config.impersonation.enabled is true.
  // Runs after headerAuthMiddleware so an active impersonation cookie takes precedence.
  router.use(impersonationMiddleware);

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
  let basepath = opts.basepath || config.webapp.basepath || '/';
  if ( !basepath.startsWith('/') ) {
    basepath = '/' + basepath;
  }
  const disableWebApp = opts.disableWebApp || false;
  const logRequests = opts.logRequests === undefined ? true : opts.logRequests;

  app.use(basepath, caskRouter({ disableWebApp, logRequests }));

  if ( config.headerAuth.enabled ) {
    logger.warn('Header auth is ENABLED — the server will trust user identity from the '
      + `"${config.headerAuth.header}" request header without verification. `
      + 'Only use this behind a trusted reverse proxy or API gateway.');
  }

  if ( config.impersonation.enabled ) {
    logger.warn('User impersonation is ENABLED — any client can act as any username by setting the '
      + `"${config.impersonation.cookieName}" cookie, with no verification whatsoever. `
      + 'Never enable this outside of local development.');
  }

  app.listen(port, () => {
    logger.info(`CaskFs web application running on port ${port}`);
    logger.info(`Mounted at basepath : ${basepath}`);
    logger.info(`Web application     : ${disableWebApp ? 'disabled' : 'enabled'}`);
    logger.info(`Request logging     : ${logRequests ? 'enabled' : 'disabled'}`);
    logger.info(`Postgres connection : ${config.postgres.host}:${config.postgres.port}`);
    logger.info(`Header auth         : ${config.headerAuth.enabled ? 'enabled' : 'disabled'}`);
    if( config.headerAuth.enabled ) {
      logger.info(`Header auth header  : ${config.headerAuth.header}`);
      logger.info(`Header auth user    : ${config.headerAuth.userPaths.join(', ')}`);
      logger.info(`Header auth roles   : ${config.headerAuth.rolesPaths.join(', ')}`);
    }
    logger.info(`ACL                 : ${config.acl.enabled ? 'enabled' : 'disabled'}`);
    logger.info(`Impersonation       : ${config.impersonation.enabled ? 'enabled' : 'disabled'}`);
    logger.info(`Audit logging       : ${config.audit.enabled ? 'enabled' : 'disabled'}`);

  });
}

export { startServer, caskRouter };

// Start the server if this file is run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startServer();
}
