import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { MissingResourceError } from '../lib/errors.js';

const router = Router();

// ls command.  return list of files in directory
// this should return the acl for the asked directory as well
router.get(/(.*)/, async (req, res) => {
  try {
    const directoryPath = req.params[0] || '/';
    const resp = await caskFs.ls({
      directory: directoryPath
    });
    res.status(200).json(resp);
  } catch (e) {
    if ( e instanceof MissingResourceError ) {
      return res.status(404).json({ error: e.message });
    }
    return handleError(res, req, e);
  }
});

// set ACL on directory
router.put(/(.*)/, (req, res) => {
  res.status(404).json({ error: 'Not Implemented Yet' });
});

export default router;