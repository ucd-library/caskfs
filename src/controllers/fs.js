import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';

const router = Router();

const METADATA_ACCEPT = 'application/vnd.caskfs.file-metadata+json';

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

// get file content or metadata
router.get(/(.*)/, async (req, res) => {
  try {

    const filePath = req.params[0] || '/';

    if ( 
      (req.query?.metadata || '').trim().toLowerCase() === 'true' || 
      req.headers.accept && req.headers.accept.includes(METADATA_ACCEPT)  
    ){
      res.setHeader('Content-Type', METADATA_ACCEPT);
      const metadata = await caskFs.metadata(filePath);
      return res.json(metadata);
    }

    res.status(504).json({ error: 'Not Implemented Yet' });

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
    const result = await caskFs.delete(filePath, options);
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;