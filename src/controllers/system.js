import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import config from '../lib/config.js';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const resp = await caskFs.stats({corkTraceId: req.corkTraceId});
    res.status(200).json(resp);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /system/auth-info
 * @description Advertise the OIDC provider URL and client ID that clients should use
 * to authenticate with this server. Returns 404 if OIDC is not configured.
 */
router.get('/auth-info', (req, res) => {
  if (!config.oidc.url) {
    return res.status(404).json({ error: 'OIDC is not configured on this server.' });
  }
  res.json({
    authUrl:  config.oidc.url,
    clientId: config.oidc.clientId,
  });
});

export default router;