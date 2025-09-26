import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

router.get('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// only allow new
router.post('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default router;