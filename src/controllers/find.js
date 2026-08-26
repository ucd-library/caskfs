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
    updatedAfter: { type: 'date' },
    updatedBefore: { type: 'date' },
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

const parseSuggestArgs = ( query ) => {
  const validator = new Validator({
    q: { type: 'string', required: true },
    limit: { type: 'positiveInteger' }
  });

  const parsed = validator.validate(query);

  if ( !parsed.limit ) {
    parsed.limit = 8;
  } else if ( parsed.limit > 20 ) {
    parsed.limit = 20;
  }

  return parsed;
};

router.get('/suggest/uri', async (req, res) => {
  try {
    const { q, limit } = parseSuggestArgs(req.query);
    const resp = await caskFs.rdf.suggestUri({ term: q, limit });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

router.get('/suggest/partition-key', async (req, res) => {
  try {
    const { q, limit } = parseSuggestArgs(req.query);
    const resp = await caskFs.rdf.suggestPartitionKey({ term: q, limit });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;