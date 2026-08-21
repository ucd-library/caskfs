import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { getRequestor, getRequestIp } from '../lib/middleware/header-auth.js';

const router = Router();

const silentJson = (req, res, next) => {
  json()(req, res, (err) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err);
  });
};

/**
 * POST /audit/rotate
 * @description Export audit_log partitions older than the configured hot window to
 * gzipped JSONL under <rootDir>/audit, then drop them from Postgres. Global admin only.
 * Pass {"dryRun": true} to report what would be rotated without touching anything.
 */
router.post('/rotate', silentJson, async (req, res) => {
  try {
    const dryRun = !!(req.body || {}).dryRun;
    const result = await caskFs.rotateAuditLog({
      dryRun,
      requestor: getRequestor(req),
      ip: getRequestIp(req)
    });
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /audit/archives
 * @description List rotated audit_log archive files. Global admin only.
 */
router.get('/archives', async (req, res) => {
  try {
    const archives = await caskFs.listAuditArchives({ requestor: getRequestor(req) });
    res.status(200).json({ archives });
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /audit/archives/:name
 * @description Download one rotated audit_log archive file as raw gzipped bytes.
 * Global admin only.
 */
router.get('/archives/:name', async (req, res) => {
  try {
    const { name, size, stream } = await caskFs.getAuditArchive({
      name: req.params.name,
      requestor: getRequestor(req)
    });
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    stream.pipe(res);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * DELETE /audit/archives/:name
 * @description Permanently delete one rotated audit_log archive file. Global admin only.
 */
router.delete('/archives/:name', async (req, res) => {
  try {
    const result = await caskFs.deleteAuditArchive({
      name: req.params.name,
      requestor: getRequestor(req),
      ip: getRequestIp(req)
    });
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
