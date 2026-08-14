import { Router, json } from 'express';
import handleError from './handleError.js';
import { Validator } from './validate.js';
import caskFs from './caskFs.js';
import { getRequestor } from '../lib/middleware/header-auth.js';

const router = Router();

const parseArgs = ( filePath, query, requestor ) => {
  const validator = new Validator({
    predicate: { type: 'string', multiple: true },
    ignorePredicate: { type: 'string', multiple: true },
    partitionKeys: { type: 'string', multiple: true },
    graph: { type: 'string' },
    subject: { type: 'string' },
    stats: { type: 'boolean' }
  });

  return { filePath, requestor, ...validator.validate(query) };
}

router.get(/(.*)/, async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const options = parseArgs(filePath, req.query, getRequestor(req));
    const resp = await caskFs.relationships(options);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

router.post(/(.*)/, json(), async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const options = parseArgs(filePath, req.body, getRequestor(req));
    const resp = await caskFs.relationships(options);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;