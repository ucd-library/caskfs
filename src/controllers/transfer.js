import { Router } from 'express';
import handleError from './handleError.js';
import { Validator } from './validate.js';
import caskFs from './caskFs.js';

const router = Router();

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

/**
 * POST /transfer/import
 * @description Receive a .tar.gz archive in the request body and import it into CaskFS.
 * Query parameters:
 *   - overwrite {Boolean} - overwrite existing file records (default false)
 *   - aclConflict {String} - 'fail' | 'skip' | 'merge' (default 'fail')
 *   - autoPartitionConflict {String} - 'fail' | 'skip' | 'merge' (default 'fail')
 * Returns:
 *   JSON summary: { hashCount, fileCount, skippedFiles }
 */
router.post('/import', async (req, res) => {
  try {
    const validator = new Validator({
      overwrite:             { type: 'boolean' },
      aclConflict:           { type: 'string', inSet: ['fail', 'skip', 'merge'] },
      autoPartitionConflict: { type: 'string', inSet: ['fail', 'skip', 'merge'] },
    });
    const opts = validator.validate(req.query);

    const summary = await caskFs.transfer.import(req, {
      overwrite:             opts.overwrite             || false,
      aclConflict:           opts.aclConflict           || 'fail',
      autoPartitionConflict: opts.autoPartitionConflict || 'fail',
    });

    res.status(200).json(summary);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
