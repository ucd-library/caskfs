import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { Validator } from './validate.js';
import { MissingResourceError } from '../lib/errors.js';

const router = Router();

// ls command.  return list of files in directory
// this should return the acl for the asked directory as well
router.get(/(.*)/, async (req, res) => {
  const directoryPath = req.params[0] || '/';
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
    const resp = await caskFs.ls({
      directory: directoryPath,
      offset: query.offset,
      limit: query.limit,
      query: query.query,
      checkDirectoryExists: true
    });
    res.status(200).json(resp);
  } catch (e) {

    // If directory does not exist, check if a file exists at that path
    if ( e instanceof MissingResourceError ) {
      try {
        await caskFs.metadata({filePath: directoryPath});
        const baseUrl = req.baseUrl.split('/').slice(0, -1).join('/') || '';
        const fileUrl = `${req.protocol}://${req.get('host')}${baseUrl}/fs${directoryPath}`;
        res.set('Link', `<${fileUrl}>; rel="describedby"`);
        return res.status(409).json({
          message: `This path corresponds to a file, not a directory.`,
          details: {
            wrongResourceType: true,
            requestedResourceType: 'directory',
            path: directoryPath,
            link: fileUrl
          }
        });
      } catch (fileError) {
        // use original error
      }
    }
    return handleError(res, req, e);
  }
});


export default router;