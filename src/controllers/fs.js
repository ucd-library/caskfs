import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { pipeline } from 'stream/promises';
import { Validator } from './validate.js';
import { MissingResourceError } from '../lib/errors.js';

const router = Router();

const METADATA_ACCEPT = 'application/vnd.caskfs.file-metadata+json';

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

// get file content or metadata
router.get(/(.*)/, async (req, res) => {
  const filePath = req.params[0] || '/';
  try {
    const metadata = await caskFs.metadata({filePath, corkTraceId: req.corkTraceId});

    if ( 
      (req.query?.metadata || '').trim().toLowerCase() === 'true' || 
      req.headers.accept && req.headers.accept.includes(METADATA_ACCEPT)  
    ){
      res.setHeader('Content-Type', METADATA_ACCEPT);
      return res.json(metadata);
    }
    // Headers for the file response
    const mime = metadata?.metadata?.mimeType || 'application/octet-stream';
    const size = metadata?.size;
    const etag = metadata?.hash_value;

    // Content-Type (+ charset for text-ish types)
    const needsCharset = mime.startsWith('text/') || /(json|xml|yaml|csv)/i.test(mime);
    res.setHeader('Content-Type', needsCharset ? `${mime}; charset=utf-8` : mime);

    if (typeof size === 'number') {
      res.setHeader('Content-Length', String(size));
    }
    if (etag) {
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        res.status(304);
        return res.end();
      }
    }

    // We’re always streaming; advertise no range support for now
    res.setHeader('Accept-Ranges', 'none');

    res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);

    const readStream = await caskFs.read({filePath}, { stream: true, encoding: null });

    // Clean up if the client bails out mid-transfer
    req.on('aborted', () => {
      if (readStream?.destroy) readStream.destroy();
    });

    await pipeline(readStream, res);

  } catch (e) {

    // If file does not exist, check if a directory exists at that path
    if ( e instanceof MissingResourceError ) {
      try {
        const exists = await caskFs.exists({filePath});
        if (exists) {
          const baseUrl = req.baseUrl.split('/').slice(0, -1).join('/') || '';
          const fileUrl = `${req.protocol}://${req.get('host')}${baseUrl}/dir${filePath}`;
          res.set('Link', `<${fileUrl}>; rel="describedby"`);
          return res.status(409).json({
            message: `This path corresponds to a directory, not a file.`,
            details: {
              wrongResourceType: true,
              requestedResourceType: 'file',
              path: filePath,
              link: fileUrl
            }
          });
        }

      } catch (directoryError) {
        // use original error
      }
    }

    return handleError(res, req, e);
  }
});

function getWriteOptions(req) {
  let opts = {
    filePath: req.params[0],
  }

  if (req.query.mimeType) {
    opts.mimeType = req.query.mimeType;
  }
  if( req.get('x-cask-hash') ) {
    opts.hash = req.get('x-cask-hash');
  } else {
    opts.readStream = req;
  }

  if (req.method === 'PUT') {
    opts.replace = true;
  }
  return opts;
}

// only allow new file
router.post(/(.*)/, async (req, res) => {
  try {
    let opts = getWriteOptions(req);
    let result = await caskFs.write(opts);
    res.status(201).json({
      filePath: result.data.filePath,
      actions: result.data.actions
    });
  } catch (e) {
    return handleError(res, req, e);
  }
});

// allow upsert via put
router.put(/(.*)/, async (req, res) => {
  try {
    let opts = getWriteOptions(req);

    let result = await caskFs.write(opts);
    res.status(201).json({
      filePath: result.data.filePath,
      actions: result.data.actions
    });
  } catch (e) {
    return handleError(res, req, e);
  }
});

// metadata updates via patch
router.patch(/(.*)/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.delete(/(.*)/, json(), async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const validator = new Validator({
      softDelete: { type: 'boolean' },
      directory: { type: 'boolean' }
    });
    const options = validator.validate({...req.query, ...(req.body || {}) });
    let result;
    if( options.directory ) {
      options.directory = filePath;
      await caskFs.deleteDirectory(options);
      // directory delete does not return anything.
      result = { success: true };
    } else {
      options.filePath = filePath;
      result = await caskFs.deleteFile(options);
    }
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;