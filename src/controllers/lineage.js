import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { getRequestor } from '../lib/middleware/header-auth.js';

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
 * POST /lineage/add
 * @description Record that one file (fromPath) was derived from another (sourcePath).
 */
router.post('/add', silentJson, async (req, res) => {
  try {
    const { fromPath, sourcePath, relation, metadata } = req.body || {};
    if (!fromPath)   return res.status(400).json({ error: 'fromPath is required' });
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' });

    const result = await caskFs.addDerivativeLink(
      { filePath: fromPath, requestor: getRequestor(req) },
      { sourcePath, relation, metadata }
    );

    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /lineage/remove
 * @description Remove a derivative link between fromPath and sourcePath.
 */
router.post('/remove', silentJson, async (req, res) => {
  try {
    const { fromPath, sourcePath, relation } = req.body || {};
    if (!fromPath)   return res.status(400).json({ error: 'fromPath is required' });
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' });

    const result = await caskFs.removeDerivativeLink(
      { filePath: fromPath, requestor: getRequestor(req) },
      { sourcePath, relation }
    );

    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /lineage/derivatives/*
 * @description Files that were derived from the file at the given path.
 */
router.get(/^\/derivatives(\/.*)?$/, async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const result = await caskFs.getDerivatives(
      { filePath, requestor: getRequestor(req) },
      { relation: req.query.relation }
    );
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * GET /lineage/sources/*
 * @description Files that the file at the given path was derived from.
 */
router.get(/^\/sources(\/.*)?$/, async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const result = await caskFs.getSources(
      { filePath, requestor: getRequestor(req) },
      { relation: req.query.relation }
    );
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
