import CaskFs from '../../index.js';
import HttpCaskFsClient from '../../lib/http-client.js';

/**
 * @function getClient
 * @description Factory that returns the appropriate CaskFS client based on the
 * active environment type. Returns an HttpCaskFsClient for 'http' environments
 * and a CaskFs instance for 'direct-pg' environments.
 *
 * @param {Object} opts - Options object populated by handleGlobalOpts()
 * @param {Object} [opts.environment] - Active environment descriptor
 * @param {Object} [opts.environment.config] - Environment configuration
 * @param {String} [opts.environment.config.type] - 'http' or 'direct-pg'
 * @param {String} [opts.environment.config.host] - Base URL (http) or host (direct-pg)
 * @param {String} [opts.environment.config.token] - Bearer token (http only)
 * @param {String} [opts.requestor] - Requestor username
 * @returns {HttpCaskFsClient|CaskFs}
 */
function getClient(opts={}) {
  const envConfig = opts.environment?.config || {};

  if (envConfig.type === 'http') {
    return new HttpCaskFsClient({
      host: envConfig.host,
      path: envConfig.path || '/api',
      token: envConfig.token || null,
      requestor: opts.requestor || null,
    });
  }

  // direct-pg (default)
  const client = new CaskFs();
  return client;
}

/**
 * @function endClient
 * @description Clean up the client connection. For direct-pg clients this closes
 * the PostgreSQL connection pool; for http clients it is a no-op.
 *
 * @param {HttpCaskFsClient|CaskFs} client
 * @returns {Promise<void>}
 */
async function endClient(client) {
  if (client?.dbClient?.end) {
    await client.dbClient.end();
  }
}

/**
 * @function assertDirectPg
 * @description Exit with a helpful error message if the client is not in
 * direct-pg mode. Used to guard commands that cannot run against an HTTP server.
 *
 * @param {HttpCaskFsClient|CaskFs} client
 * @param {String} commandName - Name of the CLI command being run (for the error message)
 */
function assertDirectPg(client, commandName) {
  if (client.mode === 'http') {
    console.error(
      `Error: "${commandName}" requires a direct-pg connection.\n` +
      `Switch to a direct-pg environment with: cask -e <env-name> ${commandName}`
    );
    process.exit(1);
  }
}

export { getClient, endClient, assertDirectPg };
