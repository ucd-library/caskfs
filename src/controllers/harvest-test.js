import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import acl from '../lib/acl.js';
import { AclAccessError } from '../lib/errors.js';
import { getRequestor } from '../lib/middleware/header-auth.js';

const router = Router();

/**
 * @function assertAdmin
 * @description Throw AclAccessError unless the requestor is a global admin, or ACL is disabled/
 * bypassed. Harvesting configuration is a system-wide setting (not scoped to any directory), so
 * this checks the global admin role/superAdminUser via acl.aclLookupRequired() rather than a
 * per-directory ACL permission.
 *
 * @param {import('express').Request} req
 * @throws {AclAccessError} if the requestor is not an admin and ACL enforcement is active
 */
async function assertAdmin(req) {
  const requestor = getRequestor(req);
  const lookupRequired = await acl.aclLookupRequired({ requestor, dbClient: caskFs.dbClient });
  if( lookupRequired ) {
    throw new AclAccessError('Admin access required to test harvesting configuration', requestor, null, 'admin');
  }
}

/**
 * GET /harvest-test?uri=...
 * @description Test a single URI against the configured Linked Data Harvesting Configuration
 * (see docs/ld.md) and report which mechanisms -- literal, filter, link -- would harvest it.
 * Pure config check, no database access. Admin-only, since harvesting rules are a system-wide
 * configuration.
 */
router.get('/', async (req, res) => {
  try {
    await assertAdmin(req);

    const uri = req.query.uri;
    if( typeof uri !== 'string' || !uri ) {
      return res.status(400).json({ error: '"uri" query parameter is required' });
    }

    res.status(200).json(caskFs.rdf.testHarvest(uri));
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
