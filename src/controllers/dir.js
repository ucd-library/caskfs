import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';

const router = Router();

// ls command.  return list of files in directory
// this should return the acl for the asked directory as well
router.get(/(.*)/, async (req, res) => {
  try {
    const directoryPath = req.params[0] || '/';
    const resp = await caskFs.ls({
      directory: directoryPath,
      offset: req.query.offset,
      limit: req.query.limit,
      query: req.query.query
    });
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});


export default router;