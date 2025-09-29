import { Router } from 'express';

const router = Router();

// get file relationships to other files
// support both GET and POST for this
router.get('/', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.post('/', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default router;