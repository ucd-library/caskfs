import config from '../config.js';
import logger from '../../client/logger.js';

/**
 * @function getByPath
 * @description Resolve a dot-notation path against an object.
 * Returns undefined if any segment along the path is missing.
 * @param {Object} obj
 * @param {String} path - e.g. "user.profile.name"
 * @returns {*}
 */
function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

/**
 * @function firstMatch
 * @description Try each dot-notation path in order and return the first
 * non-null, non-undefined value found.
 * @param {Object} obj
 * @param {String[]} paths
 * @returns {*}
 */
function firstMatch(obj, paths) {
  for (const path of paths) {
    const val = getByPath(obj, path);
    if (val !== undefined && val !== null) return val;
  }
  return undefined;
}

/**
 * @function toRolesArray
 * @description Normalize a roles value to an array of strings.
 * A singleton string is wrapped in an array; null/undefined yields [].
 * @param {String|String[]|null|undefined} val
 * @returns {String[]}
 */
function toRolesArray(val) {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [String(val)];
}

/**
 * @function headerAuthMiddleware
 * @description Express middleware that reads the configured header (default: x-user),
 * parses it as a JSON object, and extracts the username and roles using the configured
 * dot-notation path expressions.  Sets req.user = { username, roles } on the request.
 *
 * Only active when config.headerAuth.enabled is true.  Requests without the header
 * are passed through untouched.  Malformed JSON is logged and ignored.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
function headerAuthMiddleware(req, res, next) {
  const raw = req.headers[config.headerAuth.header];
  if (!raw) return next();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch(e) {
    logger.warn(`header-auth: could not parse "${config.headerAuth.header}" as JSON — ignoring`);
    return next();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.warn(`header-auth: "${config.headerAuth.header}" value is not a JSON object — ignoring`);
    return next();
  }

  req.user = {
    username : firstMatch(parsed, config.headerAuth.userPaths)  ?? null,
    roles    : toRolesArray(firstMatch(parsed, config.headerAuth.rolesPaths)),
  };

  next();
}

export default headerAuthMiddleware;
