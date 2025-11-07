import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';

const router = Router();

const parseArgs = ( query ) => {
  const parsed = {};

  const stringArgs = ['subject', 'predicate', 'object', 'graph', 'type'];
  for (const key of stringArgs) {
    if (query[key]) {
      parsed[key] = query[key];
    }
  }

  const positiveIntArgs = ['limit', 'offset'];
  for (const key of positiveIntArgs) {
    if (query[key]) {
      const value = parseInt(query[key], 10);
      if (!isNaN(value) && value > 0) {
        parsed[key] = value;
      }
    }
  }

  if ( !parsed.limit ) {
    parsed.limit = 20;
  } else if ( parsed.limit > 100 ) {
    parsed.limit = 100; // reasonable limit for http?
  }

  return parsed;
};

router.get('/', async (req, res) => {
  try {
    const options = parseArgs(req.query);
    const resp = await caskFs.rdf.find(options);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

router.post('/', json(), async (req, res) => {
  try {
    const options = parseArgs(req.body);
    const resp = await caskFs.rdf.find(options);
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;