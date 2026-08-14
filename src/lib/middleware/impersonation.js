import config from '../config.js';

/**
 * @function getCookie
 * @description Read a single named cookie's value out of a raw Cookie request header.
 * @param {String} header - raw value of req.headers.cookie, e.g. "a=1; b=2"
 * @param {String} name - cookie name to extract
 * @returns {String|null} decoded cookie value, or null if not present
 */
function getCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch(e) {
      return null;
    }
  }
  return null;
}

/**
 * @function impersonationMiddleware
 * @description Express middleware that lets the webapp act as an arbitrary username, with no
 * verification. A no-op unless config.impersonation.enabled is true — that flag must be
 * explicitly opted into at server startup (the `serve --allow-impersonation` CLI flag or
 * CASKFS_ALLOW_IMPERSONATION env var), since anyone who can reach this server can then claim
 * to be any user simply by setting a cookie. The check happens here, per-request, rather than
 * only at router-construction time, so it can't be left active by a stale mount decision.
 *
 * When enabled and config.impersonation.cookieName is present, it overrides whatever req.user
 * was set to by headerAuthMiddleware. Roles are intentionally NOT sourced from the cookie -
 * every ACL check re-resolves roles from the database by username (see acl.js userInRole), so
 * to test as a given role, assign that role to the impersonated username via the existing
 * roles admin UI.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
function impersonationMiddleware(req, res, next) {
  if (!config.impersonation.enabled) return next();

  const username = getCookie(req.headers.cookie, config.impersonation.cookieName);
  if (username) {
    req.user = { username, roles: [] };
  }
  next();
}

export default impersonationMiddleware;
