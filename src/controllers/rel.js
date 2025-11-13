import { Router, json } from 'express';
import handleError from './handleError.js';
import { Validator } from './validate.js';
import caskFs from './caskFs.js';

const router = Router();

const parseArgs = ( filePath, query ) => {
  const validator = new Validator({
    predicate: { type: 'string', multiple: true },
    ignorePredicate: { type: 'string', multiple: true },
    partitionKeys: { type: 'string', multiple: true },
    graph: { type: 'string' },
    subject: { type: 'string' },
    stats: { type: 'boolean' }
  });

  return { filePath, ...validator.validate(query) };
}

router.get(/(.*)/, async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const options = parseArgs(filePath, req.query);
    const resp = await caskFs.relationships(options);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

router.post(/(.*)/, json(), async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const options = parseArgs(filePath, req.body);
    const resp = await caskFs.relationships(options);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;