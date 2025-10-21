import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { pipeline } from 'stream/promises';

const router = Router();

const METADATA_ACCEPT = 'application/vnd.caskfs.file-metadata+json';

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

// get file content or metadata
router.get(/(.*)/, async (req, res) => {
  try {

    const filePath = req.params[0] || '/';
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

    const readStream = await caskFs.read(filePath, { stream: true, encoding: null });

    // Clean up if the client bails out mid-transfer
    req.on('aborted', () => {
      if (readStream?.destroy) readStream.destroy();
    });

    await pipeline(readStream, res);

  } catch (e) {
    return handleError(res, req, e);
  }
});

// only allow new file
router.post(/(.*)/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});
 
// allow upsert via put
router.put(/(.*)/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// metadata updates via patch
router.patch(/(.*)/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.delete(/(.*)/, async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const options = {
      softDelete: req.body?.softDelete === true || req.query?.softDelete === 'true'
    };
    const result = await caskFs.delete({filePath, corkTraceId: req.corkTraceId}, options);
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;