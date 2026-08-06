import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { Validator } from './validate.js';
import { silentJson } from './fs.js';
import acl from '../lib/acl.js';
import { AclAccessError } from '../lib/errors.js';
import config from '../lib/config.js';

const router = Router();

const parseArgs = ( query ) => {
  const validator = new Validator({
    type: {
      type: 'string',
      required: true,
      inSet: ['bucket', 'partition']
    }
  });

  const parsed = validator.validate(query);
  return parsed;
};

/**
 * @function assertAdmin
 * @description Throw AclAccessError unless the requestor is a global admin, or ACL is disabled/
 * bypassed. Auto-path rules are a system-wide configuration (not scoped to any directory), so
 * this checks the global admin role/superAdminUser via acl.aclLookupRequired() rather than a
 * per-directory ACL permission.
 *
 * @param {import('express').Request} req
 * @throws {AclAccessError} if the requestor is not an admin and ACL enforcement is active
 */
async function assertAdmin(req) {
  const requestor = req.user?.username || config.acl.defaultRequestor || null;
  const lookupRequired = await acl.aclLookupRequired({ requestor, dbClient: caskFs.dbClient });
  if( lookupRequired ) {
    throw new AclAccessError('Admin access required to manage auto-path rules', requestor, null, 'admin');
  }
}

router.get('/:type', async (req, res) => {
  try {
    const options = parseArgs({
      type: req.params.type
    });
    const resp = await caskFs.autoPath[options.type].getConfig(true);
    res.status(200).json(resp.map( r => {
      r.filter_regex = r.filter_regex ? r.filter_regex.toString() : null;
      r.full_regex = r.full_regex ? r.full_regex.toString() : null;
      return r;
    }));
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /auto-path/:type/test
 * @description Evaluate every configured rule of the given type against a file path, without
 * writing anything. Mirrors the CLI's `cask auto-path test <type> <file-path>` for http-mode use.
 * Admin-only, since auto-path rule definitions are a system-wide configuration.
 */
router.get('/:type/test', async (req, res) => {
  try {
    const options = parseArgs({
      type: req.params.type
    });
    await assertAdmin(req);

    const filePath = req.query.filePath;
    if( typeof filePath !== 'string' || !filePath ) {
      return res.status(400).json({ error: '"filePath" query parameter is required' });
    }

    const resp = await caskFs.autoPath[options.type].getFromPath(filePath);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /auto-path/load
 * @description Bulk-apply auto-path rules from a JSON body shaped like the CLI's rules file:
 * `{ bucket: [...rules], partition: [...rules] }` (see docs/auto-path.md for the rule shape).
 * Admin-only. Rules that are new or actually changed are applied (and, for `partition` rules,
 * trigger a retroactive rescan of existing files); rules identical to what's already stored are
 * skipped — see the `updated` flag in each result entry.
 */
router.post('/load', silentJson, async (req, res) => {
  try {
    await assertAdmin(req);

    const data = req.body;
    if( typeof data !== 'object' || data === null || Array.isArray(data) ) {
      return res.status(400).json({ error: 'Request body must be a JSON object with "bucket" and/or "partition" arrays' });
    }

    const results = await caskFs.loadAutoPathRules(data);
    res.status(200).json({ results });
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;