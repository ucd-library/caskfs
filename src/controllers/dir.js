import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { Validator } from './validate.js';

const router = Router();

// ls command.  return list of files in directory
// this should return the acl for the asked directory as well
router.get(/(.*)/, async (req, res) => {
  try {
    const validator = new Validator({
      query: { type: 'string' },
      limit: { type: 'positiveInteger' },
      offset: { type: 'positiveIntegerOrZero' }
    });
    const query = validator.validate(req.query);
    if ( !query.limit ) {
      query.limit = 20;
    }
    const directoryPath = req.params[0] || '/';
    const resp = await caskFs.ls({
      directory: directoryPath,
      offset: query.offset,
      limit: query.limit,
      query: query.query
    });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});


export default router;