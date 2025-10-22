import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const resp = await caskFs.stats({corkTraceId: req.corkTraceId});
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;