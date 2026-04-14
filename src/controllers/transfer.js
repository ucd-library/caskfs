import { Router } from 'express';
import handleError from './handleError.js';
import { Validator } from './validate.js';
import caskFs from './caskFs.js';

const router = Router();

/**
 * GET /transfer/export/preflight
 * @description Return hash and file counts for a prospective export without streaming data.
 * Query parameters:
 *   - rootDir {String} required - CaskFS path prefix to count
 * Returns: { hashCount, fileCount }
 */
router.get('/export/preflight', async (req, res) => {
  try {
    const validator = new Validator({
      rootDir: { type: 'string', required: true },
    });
    const opts = validator.validate(req.query);
    const counts = await caskFs.transfer.exportPreflight({ rootDir: opts.rootDir });
    res.json(counts);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /transfer/export
 * @description Stream a .tar.gz archive of CaskFS content to the response.
 * Query parameters:
 *   - rootDir {String} required - only export files under this CaskFS path
 *   - includeAcl {Boolean} - include ACL data (default false)
 *   - includeAutoPartition {Boolean} - include auto-partition rules (default false)
 */
router.get('/export', async (req, res) => {
  try {
    const validator = new Validator({
      rootDir:              { type: 'string',  required: true },
      includeAcl:           { type: 'boolean' },
      includeAutoPartition: { type: 'boolean' },
    });
    const opts = validator.validate(req.query);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `caskfs-export-${ts}.tar.gz`;

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await caskFs.transfer.export(res, {
      rootDir:              opts.rootDir,
      includeAcl:           opts.includeAcl           || false,
      includeAutoPartition: opts.includeAutoPartition || false,
    });

  } catch (e) {
    // If headers already sent the stream is mid-flight; nothing we can do.
    if (res.headersSent) return;
    return handleError(res, req, e);
  }
});

export default router;
