import { Router } from 'express';

const router = Router();

// ls command.  return list of files in directory
// this should return the acl for the asked directory as well
router.get(/.*/, (req, res) => {
  res.status(404).json({ error: 'Not Implemented Yet' });
});

// set ACL on directory
router.put(/.*/, (req, res) => {
  res.status(404).json({ error: 'Not Implemented Yet' });
});

export default router;