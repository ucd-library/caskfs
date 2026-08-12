import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { Validator } from './validate.js';
import { silentJson } from './fs.js';
import { getRequestor } from '../lib/middleware/header-auth.js';
import acl from '../lib/acl.js';

const router = Router();

const PERMISSIONS = ['read', 'write', 'admin'];
const PRINCIPAL_TYPES = ['role', 'user'];

const permissionBodyValidator = new Validator({
  principal:     { type: 'string', required: true },
  principalType: { type: 'string', inSet: PRINCIPAL_TYPES },
  permission:    { type: 'string', required: true, inSet: PERMISSIONS }
});

const roleBodyValidator = new Validator({
  role: { type: 'string', required: true }
});

const userBodyValidator = new Validator({
  user: { type: 'string', required: true }
});

const testQueryValidator = new Validator({
  filePath:   { type: 'string', required: true },
  permission: { type: 'string', required: true, inSet: PERMISSIONS },
  user:       { type: 'string' },
  isFile:     { type: 'boolean' }
});

const MAX_LIST_LIMIT = 100;

const listQueryValidator = new Validator({
  search: { type: 'string' },
  limit:  { type: 'positiveInteger' },
  offset: { type: 'positiveIntegerOrZero' }
});

/**
 * @description Parse+clamp the shared search/limit/offset query params used by the paginated
 * roles/users/membership list endpoints.
 * @param {Object} query - req.query
 * @returns {Object} {search, limit, offset}
 */
function parseListQuery(query) {
  const { search, limit, offset } = listQueryValidator.validate(query || {});
  return {
    search,
    limit: Math.min(limit ?? 25, MAX_LIST_LIMIT),
    offset: offset ?? 0
  };
}

// ---------------------------------------------------------------------------
// Directory ACL - per-directory 'admin' permission, enforced by
// caskFs.canUpdateDirAcl() inside each of these caskFs methods.
// ---------------------------------------------------------------------------

/**
 * GET /acl/directory/*
 * @description Get the ACL for a directory, including inherited permissions.
 */
router.get(/^\/directory(\/.*)?$/, async (req, res) => {
  try {
    const directory = req.params[0] || '/';
    const resp = await caskFs.getDirectoryAcl({ filePath: directory, requestor: getRequestor(req) });

    if( !resp || resp.length === 0 ) {
      return res.status(404).json({ error: `No ACL found for ${directory}` });
    }

    const directoryAcl = resp[0];
    directoryAcl.permissions = (directoryAcl.permissions || []).filter(p => p.principalName !== null && p.permission !== null);
    directoryAcl.public = !!directoryAcl.public;
    res.status(200).json(directoryAcl);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * PUT /acl/directory/*\/public
 * @description Set or clear the public-read flag for a directory. Creates the directory's
 * root ACL if it does not already have one.
 */
router.put(/^\/directory(\/.*)?\/public$/, silentJson, async (req, res) => {
  try {
    const directory = req.params[0] || '/';
    const validator = new Validator({ public: { type: 'boolean', required: true } });
    const { public: isPublic } = validator.validate(req.body || {});

    await caskFs.setDirectoryPublic({ directory, permission: isPublic, requestor: getRequestor(req) });
    res.status(200).json({ directory, public: isPublic });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /acl/directory/*\/permissions
 * @description Grant a principal (a role or a user) a permission on a directory. Creates the
 * principal and/or the directory's root ACL if they do not already exist. Child directories
 * inherit this permission unless explicitly overridden. `principalType` defaults to 'role'.
 */
router.post(/^\/directory(\/.*)?\/permissions$/, silentJson, async (req, res) => {
  try {
    const directory = req.params[0] || '/';
    const { principal, principalType, permission } = permissionBodyValidator.validate(req.body || {});

    await caskFs.setDirectoryPermission({ directory, principal, principalType, permission, requestor: getRequestor(req) });
    res.status(200).json({ directory, principal, principalType: principalType || 'role', permission });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * DELETE /acl/directory/*\/permissions
 * @description Revoke a principal's (a role's or a user's) permission on a directory.
 * `principalType` defaults to 'role'.
 */
router.delete(/^\/directory(\/.*)?\/permissions$/, silentJson, async (req, res) => {
  try {
    const directory = req.params[0] || '/';
    const { principal, principalType, permission } = permissionBodyValidator.validate(req.body || {});

    await caskFs.removeDirectoryPermission({ directory, principal, principalType, permission, requestor: getRequestor(req) });
    res.status(200).json({ directory, principal, principalType: principalType || 'role', permission });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * DELETE /acl/directory/*
 * @description Remove a directory's own ACL entirely. It (and its children that don't have
 * their own explicit ACL) will inherit from the nearest ancestor directory that has one.
 */
router.delete(/^\/directory(\/.*)?$/, async (req, res) => {
  try {
    const directory = req.params[0] || '/';
    await caskFs.removeDirectoryAcl({ directory, requestor: getRequestor(req) });
    res.status(200).json({ directory });
  } catch (e) {
    return handleError(res, req, e);
  }
});

// ---------------------------------------------------------------------------
// Identity - no admin gate. This is inherently a "tell me about myself" endpoint,
// used by the webapp to know its own username/roles and whether to show admin-only UI.
// ---------------------------------------------------------------------------

/**
 * GET /acl/whoami
 * @description Report the caller's own identity: username, roles, and whether they hold
 * global admin access. `isAdmin` is computed the same way real ACL enforcement decides it
 * (acl.aclLookupRequired) so it can't drift out of sync with what the caller can actually do.
 */
router.get('/whoami', async (req, res) => {
  try {
    const username = getRequestor(req);
    if (!username) {
      return res.status(200).json({ username: null, roles: [], isAdmin: false });
    }

    const { roles } = await caskFs.getUserRoles({ user: username, requestor: username, limit: MAX_LIST_LIMIT });
    const isAdmin = !(await acl.aclLookupRequired({ requestor: username, dbClient: caskFs.dbClient }));
    res.status(200).json({ username, roles, isAdmin });
  } catch (e) {
    return handleError(res, req, e);
  }
});

// ---------------------------------------------------------------------------
// Global roles/users - system-wide, not scoped to a directory. Enforced by
// caskFs.allowAdminAction() inside each of these caskFs methods, which requires the
// requestor to hold the global admin role (or ACL to be disabled/bypassed).
// ---------------------------------------------------------------------------

/**
 * GET /acl/roles
 * @description List defined roles, optionally filtered by `?search=` (case-insensitive
 * substring match on role name) and paginated via `?limit=&offset=` (default 25, max 100).
 * Admin-only.
 */
router.get('/roles', async (req, res) => {
  try {
    const { search, limit, offset } = parseListQuery(req.query);
    const resp = await caskFs.getRoles({ search, limit, offset, requestor: getRequestor(req) });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /acl/roles
 * @description Create a new role (no-op if it already exists). Admin-only.
 */
router.post('/roles', silentJson, async (req, res) => {
  try {
    const { role } = roleBodyValidator.validate(req.body || {});
    await caskFs.ensureRole({ role, requestor: getRequestor(req) });
    res.status(200).json({ role });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /acl/roles/:role/users
 * @description List users assigned to a role, optionally filtered by `?search=`
 * (case-insensitive substring match on username) and paginated via `?limit=&offset=`
 * (default 25, max 100). Admin-only.
 */
router.get('/roles/:role/users', async (req, res) => {
  try {
    const { search, limit, offset } = parseListQuery(req.query);
    const resp = await caskFs.getRole({ role: req.params.role, search, limit, offset, requestor: getRequestor(req) });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * DELETE /acl/roles/:role
 * @description Remove a role and all of its user assignments and directory permissions. Admin-only.
 */
router.delete('/roles/:role', async (req, res) => {
  try {
    await caskFs.removeRole({ role: req.params.role, requestor: getRequestor(req) });
    res.status(200).json({ role: req.params.role });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /acl/users
 * @description List defined users, optionally filtered by `?search=` (case-insensitive
 * substring match on username) and paginated via `?limit=&offset=` (default 25, max 100).
 * Admin-only.
 */
router.get('/users', async (req, res) => {
  try {
    const { search, limit, offset } = parseListQuery(req.query);
    const resp = await caskFs.getUsers({ search, limit, offset, requestor: getRequestor(req) });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /acl/users
 * @description Create a new user (no-op if it already exists). Admin-only.
 */
router.post('/users', silentJson, async (req, res) => {
  try {
    const { user } = userBodyValidator.validate(req.body || {});
    await caskFs.ensureUser({ user, requestor: getRequestor(req) });
    res.status(200).json({ user });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * DELETE /acl/users/:user
 * @description Remove a user and all of their role assignments. Admin-only.
 */
router.delete('/users/:user', async (req, res) => {
  try {
    await caskFs.removeUser({ user: req.params.user, requestor: getRequestor(req) });
    res.status(200).json({ user: req.params.user });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /acl/users/:user/roles
 * @description List roles assigned to a user, optionally filtered by `?search=`
 * (case-insensitive substring match on role name) and paginated via `?limit=&offset=`
 * (default 25, max 100). A caller may always look up their own roles; looking up another
 * user's roles requires the global admin role.
 */
router.get('/users/:user/roles', async (req, res) => {
  try {
    const { search, limit, offset } = parseListQuery(req.query);
    const resp = await caskFs.getUserRoles({ user: req.params.user, search, limit, offset, requestor: getRequestor(req) });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /acl/users/:user/roles
 * @description Assign a role to a user. Creates the user and/or role if they don't already exist. Admin-only.
 */
router.post('/users/:user/roles', silentJson, async (req, res) => {
  try {
    const { role } = roleBodyValidator.validate(req.body || {});
    await caskFs.setUserRole({ user: req.params.user, role, requestor: getRequestor(req) });
    res.status(200).json({ user: req.params.user, role });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * DELETE /acl/users/:user/roles/:role
 * @description Remove a role from a user. Admin-only.
 */
router.delete('/users/:user/roles/:role', async (req, res) => {
  try {
    await caskFs.removeUserRole({ user: req.params.user, role: req.params.role, requestor: getRequestor(req) });
    res.status(200).json({ user: req.params.user, role: req.params.role });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /acl/test
 * @description Test whether a user (or, if omitted, the public) would have a specific
 * permission on a file or directory. A system-wide diagnostic, so it's admin-only rather
 * than scoped to the target path's own ACL.
 */
router.get('/test', async (req, res) => {
  try {
    const { filePath, permission, user, isFile } = testQueryValidator.validate(req.query || {});
    const hasPermission = await caskFs.testPermission({
      filePath, permission, user, isFile,
      requestor: getRequestor(req)
    });
    res.status(200).json({ filePath, permission, user: user || null, hasPermission });
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
