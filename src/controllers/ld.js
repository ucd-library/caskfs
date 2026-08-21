import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { getRequestor } from '../lib/middleware/header-auth.js';

const router = Router();

// get linked data
// support both GET and POST for this
router.get('/', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.post('/', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// re-parse and re-store RDF triples for a file, or every rdf-resourceType file under a
// directory (recursively). Files whose resourceType is not rdf are skipped, not errored.
router.post('/reharvest', async (req, res) => {
  try {
    const { path: targetPath } = req.body || {};
    if (!targetPath) return res.status(400).json({ error: 'path is required' });

    const result = await caskFs.reharvest({ filePath: targetPath, requestor: getRequestor(req) });

    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
