import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { Validator } from './validate.js';

const router = Router();

const parseArgs = ( query ) => {
  const validator = new Validator({
    subject: { type: 'string' },
    predicate: { type: 'string' },
    object: { type: 'string' },
    graph: { type: 'string' },
    type: { type: 'string' },
    limit: { type: 'positiveInteger' },
    offset: { type: 'positiveIntegerOrZero' },
    partitionKeys: { type: 'string', multiple: true }
  });

  const parsed = validator.validate(query);

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