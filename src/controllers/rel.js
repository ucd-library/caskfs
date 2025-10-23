import { Router, json } from 'express';
import handleError, { ApiValidationError } from './handleError.js';
import caskFs from './caskFs.js';

const router = Router();

const parseArgs = ( filePath, query ) => {
  const out = { filePath };

  const stringArrayFmt = 'comma separated string or array of strings';
  if ( query.predicate ){
    try {
      out.predicate = (Array.isArray(query.predicate) ? query.predicate : query.predicate.split(',')).map(s => s.trim());
    } catch(e) {
      throw new ApiValidationError('predicate', stringArrayFmt, query.predicate);
    }
  }

  if ( query.ignorePredicate ){
    try {
      out.ignorePredicate = (Array.isArray(query.ignorePredicate) ? query.ignorePredicate : query.ignorePredicate.split(',')).map(s => s.trim());
    } catch(e) {
      throw new ApiValidationError('ignorePredicate', stringArrayFmt, query.ignorePredicate);
    }
  }

  if ( query.partitionKeys ){
    try {
      out.partitionKeys = (Array.isArray(query.partitionKeys) ? query.partitionKeys : query.partitionKeys.split(',')).map(s => s.trim());
    } catch(e) {
      throw new ApiValidationError('partitionKeys', stringArrayFmt, query.partitionKeys);
    }
  }

  if ( query.graph ){
    out.graph = query.graph;
  }

  if ( query.subject ){
    out.subject = query.subject;
  }

  if ( query.stats ){
    out.stats = query.stats === 'true' || query.stats === true;
  }

  return out;
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