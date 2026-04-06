/**
 * @function printLogo
 * @description Print the CaskFS ASCII logo and version information to stdout.
 * @param {Object} pkg - Contents of package.json
 * @param {String} pkg.version - Package version string
 */
function printLogo(pkg) {
console.log(`
   █████████                    █████      ███████████  █████████
  ███░░░░░███                  ░░███      ░░███░░░░░░█ ███░░░░░███
 ███     ░░░   ██████    █████  ░███ █████ ░███   █ ░ ░███    ░░░
░███          ░░░░░███  ███░░   ░███░░███  ░███████   ░░█████████
░███           ███████ ░░█████  ░██████░   ░███░░░█    ░░░░░░░░███
░░███     ███ ███░░███  ░░░░███ ░███░░███  ░███  ░     ███    ░███
 ░░█████████ ░░████████ ██████  ████ █████ █████      ░░█████████
  ░░░░░░░░░   ░░░░░░░░ ░░░░░░  ░░░░ ░░░░░ ░░░░░        ░░░░░░░░░

A modern data management system for linked data.
Built by The University of California, UC Davis Library.

Version: ${pkg.version}

cask --help for command line usage`);
}

/**
 * @function printConnection
 * @description Print the active connection information block to stdout.
 * @param {Object} [environment] - Active environment descriptor from handleGlobalOpts()
 * @param {String} [environment.name] - Environment name
 * @param {Object} [environment.config] - Environment configuration object
 * @param {String} [environment.config.type] - 'http' or 'direct-pg'
 * @param {String} [environment.config.host] - Host or base URL
 * @param {Number} [environment.config.port] - Port (direct-pg only)
 * @param {String} [environment.config.database] - Database name (direct-pg only)
 * @param {String} [environment.config.user] - DB user (direct-pg only)
 * @param {String} [environment.config.tokenUsername] - Logged-in username (http only)
 * @param {String} [environment.config.tokenExpiry] - ISO timestamp of token expiry (http only)
 */
function printConnection(environment) {
  if (!environment) {
    console.log('Active Connection: (none — no environment configured)');
    return;
  }

  const { name, config = {} } = environment;
  const type = config.type || 'direct-pg';

  console.log(`Active Connection: ${name}`);
  console.log(`  Type: ${type}`);

  if (type === 'http') {
    const apiPath = config.path || '/api';
    console.log(`  Host: ${config.host || '(not set)'}`);
    console.log(`  Path: ${apiPath}`);

    if (config.tokenUsername) {
      console.log(`  User: ${config.tokenUsername}`);
      if (config.tokenExpiry) {
        const expiry  = new Date(config.tokenExpiry);
        const expired = expiry <= new Date();
        console.log(`  Token: ${expired ? 'expired' : `expires ${expiry.toLocaleString()}`}`);
      }
    } else if (config.token) {
      console.log('  Auth: token configured');
    } else {
      console.log('  Auth: not logged in (public)');
    }
  } else {
    const host = config.host || 'localhost';
    const port = config.port || 5432;
    const db   = config.database || 'postgres';
    const user = config.user || 'postgres';
    console.log(`  Host: ${host}:${port}`);
    console.log(`  DB:   ${db}`);
    console.log(`  User: ${user}`);
  }
}

export { printConnection };
export default printLogo;
