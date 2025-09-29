import { Router } from 'express';

const router = Router();


// search for files
router.get('/', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.post('/', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default router;