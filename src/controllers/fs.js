import { Router } from 'express';

const router = Router();

const METADATA_ACCEPT = 'sapplication/vnd.caskfs.file-metadata+json';

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

// get file metadata
router.get(/.*/, (req, res) => {
  // get file metadata if header or query param requests it
  if( (req.params?.metadata || '').trim().toLowerCase() === 'true' || 
    req.headers.accept && req.headers.accept.includes(METADATA_ACCEPT)  ) {
    res.setHeader('Content-Type', METADATA_ACCEPT);
    return res.json({ error: 'Not Found' });
  }

  res.status(404).json({ error: 'Not Found' });
});

// only allow new file
router.post(/.*/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});
 
// allow upsert via put
router.put(/.*/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// metadata updates via patch
router.patch(/.*/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// delete file
router.delete(/.*/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default router;