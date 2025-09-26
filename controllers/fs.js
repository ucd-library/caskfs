import { Router } from 'express';

const router = Router();

const METADATA_ACCEPT = 'sapplication/vnd.caskfs.file-metadata+json';

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

router.get('*', (req, res) => {
  if( req.headers.accept && req.headers.accept.includes(METADATA_ACCEPT) ) {
    res.setHeader('Content-Type', METADATA_ACCEPT);
    return res.json({ error: 'Not Found' });
  }

  res.status(404).json({ error: 'Not Found' });
});

// only allow new
router.post('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});
 
// allow upsert via put
router.put('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// metadata updates via patch
router.patch('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.delete('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default router;