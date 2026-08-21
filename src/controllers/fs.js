import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { pipeline } from 'stream/promises';
import { Validator } from './validate.js';
import { MissingResourceError } from '../lib/errors.js';
import { getRequestor, getRequestIp } from '../lib/middleware/header-auth.js';

const router = Router();

const METADATA_ACCEPT = 'application/vnd.caskfs.file-metadata+json';

// minimum time between progress lines written to a streaming delete response
const STREAM_PROGRESS_INTERVAL_MS = 250;

/**
 * @function parseRangeHeader
 * @description Parse an HTTP Range header for a single byte-range spec.
 * Multi-range requests are not supported and return null (caller falls back to full response).
 *
 * @param {String} rangeHeader - Value of the Range request header (e.g. "bytes=0-499")
 * @param {Number} fileSize - Total file size in bytes
 * @returns {{start: Number, end: Number}|null} Parsed range or null if unsupported/unparseable
 */
function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;

  const spec = rangeHeader.slice(6);

  // Multi-range not supported; fall back to full response
  if (spec.includes(',')) return null;

  const match = spec.match(/^(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  let start, end;

  if (rawStart === '') {
    // Suffix range: bytes=-N (last N bytes)
    const suffix = parseInt(rawEnd, 10);
    if (suffix === 0) return null;
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else if (rawEnd === '') {
    // Open-ended: bytes=N-
    start = parseInt(rawStart, 10);
    end = fileSize - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = parseInt(rawEnd, 10);
  }

  return { start, end };
}

router.get('/', (req, res) => {
  res.json({ status: 'CaskFS Filesystem Controller' });
});

// get file content or metadata
router.get(/(.*)/, async (req, res) => {
  const filePath = req.params[0] || '/';
  try {
    if ( (req.query?.partitions || '').trim().toLowerCase() === 'true' ) {
      const detail = await caskFs.partitionKeyDetail({filePath, requestor: getRequestor(req), corkTraceId: req.corkTraceId});
      return res.json(detail);
    }

    const metadata = await caskFs.metadata({filePath, requestor: getRequestor(req), corkTraceId: req.corkTraceId});

    if (
      (req.query?.metadata || '').trim().toLowerCase() === 'true' ||
      req.headers.accept && req.headers.accept.includes(METADATA_ACCEPT)
    ){
      res.setHeader('Content-Type', METADATA_ACCEPT);
      return res.json(metadata);
    }

    const mime = metadata?.metadata?.mimeType || 'application/octet-stream';
    const size = metadata?.size != null ? Number(metadata.size) : null;
    const etag = metadata?.hash_value;

    const needsCharset = mime.startsWith('text/') || /(json|xml|yaml|csv)/i.test(mime);
    res.setHeader('Content-Type', needsCharset ? `${mime}; charset=utf-8` : mime);

    if (etag) {
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        res.status(304);
        return res.end();
      }
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);

    const rangeHeader = req.headers['range'];
    let readOpts = { stream: true, encoding: null };

    if (rangeHeader) {
      if (typeof size !== 'number') {
        res.setHeader('Content-Range', 'bytes */*');
        return res.status(416).end();
      }

      const range = parseRangeHeader(rangeHeader, size);

      if (!range || range.start > range.end || range.start >= size) {
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.status(416).end();
      }

      const start = range.start;
      const end = Math.min(range.end, size - 1);
      const chunkSize = end - start + 1;

      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(chunkSize));
      res.status(206);
      readOpts.start = start;
      readOpts.end = end;
    } else {
      if (typeof size === 'number') {
        res.setHeader('Content-Length', String(size));
      }
    }

    const readStream = await caskFs.read({filePath, requestor: getRequestor(req), corkTraceId: req.corkTraceId}, readOpts);

    // Clean up if the client disconnects mid-transfer
    req.on('aborted', () => {
      if (readStream?.destroy) readStream.destroy();
    });

    await pipeline(readStream, res);

  } catch (e) {

    // If file does not exist, check if a directory exists at that path
    if ( e instanceof MissingResourceError ) {
      try {
        const exists = await caskFs.exists({filePath, requestor: getRequestor(req)});
        if (exists) {
          const baseUrl = req.baseUrl.split('/').slice(0, -1).join('/') || '';
          const fileUrl = `${req.protocol}://${req.get('host')}${baseUrl}/dir${filePath}`;
          res.set('Link', `<${fileUrl}>; rel="describedby"`);
          return res.status(409).json({
            message: `This path corresponds to a directory, not a file.`,
            details: {
              wrongResourceType: true,
              requestedResourceType: 'file',
              path: filePath,
              link: fileUrl
            }
          });
        }

      } catch (directoryError) {
        // use original error
      }
    }

    return handleError(res, req, e);
  }
});

/**
 * @function handleWrite
 * @description Shared handler for POST (create) and PUT (upsert) file write requests.
 * Streams the request body directly into CaskFS as the file content.
 *
 * @param {String} filePath - Destination path in CaskFS
 * @param {import('express').Request} req - Express request (used as the read stream)
 * @param {import('express').Response} res - Express response
 * @param {Boolean} replace - If true, overwrite an existing file (PUT semantics)
 */
async function handleWrite(filePath, req, res, replace) {
  try {
    const contentType = req.headers['content-type']?.split(';')[0]?.trim();
    // ignore the generic default content-type so CaskFS can auto-detect from the file extension instead
    const mimeType = req.query.mimeType || (contentType && contentType !== 'application/octet-stream' ? contentType : undefined);

    const partitionKeys = req.query['partition-keys']
      ? req.query['partition-keys'].split(',').map(k => k.trim()).filter(Boolean)
      : [];

    let metadata = {};
    if (req.query.metadata) {
      try { 
        metadata = JSON.parse(req.query.metadata); 
      } catch(e) {
        return res.status(400).json({ error: 'Invalid JSON in metadata query parameter' });
      }
    }

    let opts = {
      filePath,
      readStream: req,
      mimeType,
      partitionKeys,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      bucket: req.query.bucket || undefined,
      replace,
      requestor: getRequestor(req) || 'http',
      ip: getRequestIp(req),
      corkTraceId: req.corkTraceId,
    };

    if( req.get('x-cask-hash') ) {
      opts.hash = req.get('x-cask-hash');
    } else {
      opts.readStream = req;
    }
    
    const ctx = await caskFs.write(opts);

    if (ctx.data?.error) {
      const err = ctx.data.error;
      if (err.name === 'DuplicateFileError') {
        return res.status(409).json({ message: err.message, code: 'DuplicateFileError' });
      }
      return res.status(400).json({ message: err.message });
    }

    const { readStream, dbClient, ...safeData } = ctx.data;
    res.status(replace ? 200 : 201).json(safeData);
  } catch (e) {
    return handleError(res, req, e);
  }
}

const silentJson = (req, res, next) => {
  json()(req, res, (err) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err);
  });
};

/**
 * POST /fs/sync
 * @description Optimistic batch write — create or update file records for files whose
 * CAS content is already present on disk.  Accepts a JSON body; no stream data.
 * Returns counts and paths for each result category.
 */
router.post('/sync', silentJson, async (req, res) => {
  try {
    const files = req.body?.files;
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'files array is required' });
    }
    const result = await caskFs.sync(
      { requestor: getRequestor(req), ip: getRequestIp(req), corkTraceId: req.corkTraceId },
      { files }
    );
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /fs/copy
 * @description Internal copy — copy a file or directory within CaskFS without
 * touching the CAS layer. Accepts a JSON body; no stream data.
 */
router.post('/copy', silentJson, async (req, res) => {
  try {
    const { srcPath, destPath, copyMetadata, copyPartitions, replace } = req.body || {};
    if (!srcPath)  return res.status(400).json({ error: 'srcPath is required' });
    if (!destPath) return res.status(400).json({ error: 'destPath is required' });

    const result = await caskFs.copy(
      { filePath: srcPath, requestor: getRequestor(req), ip: getRequestIp(req) },
      { destPath, copyMetadata, copyPartitions, replace }
    );

    if (result && typeof result.copied === 'number') {
      return res.status(200).json(result);
    }

    const { readStream, dbClient, ...safeData } = result.data || {};
    res.status(200).json(safeData.file);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * POST /fs/mv
 * @description Rename or move a file or directory within CaskFs (cask: → cask: only).
 * Preserves file_id/directory_id — only the path changes. Destination parent
 * directories are created automatically if they do not exist.
 */
router.post('/mv', silentJson, async (req, res) => {
  try {
    const { srcPath, destPath, recheckMimeType } = req.body || {};
    if (!srcPath)  return res.status(400).json({ error: 'srcPath is required' });
    if (!destPath) return res.status(400).json({ error: 'destPath is required' });

    const result = await caskFs.move(
      { filePath: srcPath, requestor: getRequestor(req), ip: getRequestIp(req) },
      { destPath, recheckMimeType }
    );

    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

// create new file — fails with 409 if path already exists
router.post(/(.*)/, async (req, res) => {
  const filePath = req.params[0] || '/';
  await handleWrite(filePath, req, res, false);
});

// create or replace file
router.put(/(.*)/, async (req, res) => {
  const filePath = req.params[0] || '/';
  await handleWrite(filePath, req, res, true);
});

// update a file's manually-assigned partition keys — auto-path keys are recomputed
// server-side and cannot be set through this endpoint
router.patch(/(.*)/, silentJson, async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const partitionKeys = req.body?.partitionKeys;

    if ( !Array.isArray(partitionKeys) ) {
      return res.status(400).json({ error: 'partitionKeys array is required' });
    }

    const result = await caskFs.patchMetadata({
      filePath,
      partitionKeys,
      requestor: getRequestor(req) || 'http',
      ip: getRequestIp(req),
      corkTraceId: req.corkTraceId,
    });

    res.status(200).json(result.metadata);
  } catch (e) {
    return handleError(res, req, e);
  }
});

/**
 * @function streamDelete
 * @description Handle a delete request in streaming mode. Writes newline-delimited JSON
 * progress events to the response as files are deleted, keeping the connection alive for
 * long-running directory deletes instead of leaving the client waiting on a single response.
 * Emits at most one progress line per STREAM_PROGRESS_INTERVAL_MS, followed by a single
 * terminal line ({type: 'complete'} or {type: 'error'}). Since headers are already sent by
 * the time an error can occur mid-delete, errors are reported in-band rather than via HTTP status.
 *
 * @param {String} filePath - file or directory path to delete
 * @param {Object} options - validated delete options (directory, softDelete, deleteLineage)
 * @param {import('express').Response} res - Express response
 * @returns {Promise<void>}
 */
async function streamDelete(filePath, options, res) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.flushHeaders();

  let deletedCount = 0;
  let lastEmit = 0;

  const onDeleteFile = (deletedFilePath) => {
    deletedCount++;
    const now = Date.now();
    if( now - lastEmit < STREAM_PROGRESS_INTERVAL_MS ) return;
    lastEmit = now;
    res.write(JSON.stringify({ type: 'progress', deletedCount, filePath: deletedFilePath }) + '\n');
  };

  try {
    let result;
    options.onDeleteFile = onDeleteFile;
    if( options.directory ) {
      options.directory = filePath;
      await caskFs.deleteDirectory(options);
      result = { success: true };
    } else {
      options.filePath = filePath;
      result = await caskFs.deleteFile(options);
      deletedCount += result.deletedLineageFiles?.length || 0;
    }
    res.write(JSON.stringify({ type: 'complete', deletedCount, result }) + '\n');
  } catch (e) {
    res.write(JSON.stringify({ type: 'error', deletedCount, message: e.message }) + '\n');
  } finally {
    res.end();
  }
}

router.delete(/(.*)/, json(), async (req, res) => {
  const filePath = req.params[0] || '/';
  const validator = new Validator({
    softDelete: { type: 'boolean' },
    directory: { type: 'boolean' },
    deleteLineage: { type: 'boolean' },
    stream: { type: 'boolean' }
  });

  try {
    const options = validator.validate({...req.query, ...(req.body || {}) });
    options.requestor = getRequestor(req);
    options.ip = getRequestIp(req);

    if( options.stream ) {
      delete options.stream;
      return await streamDelete(filePath, options, res);
    }

    let result;
    if( options.directory ) {
      options.directory = filePath;
      await caskFs.deleteDirectory(options);
      // directory delete does not return anything.
      result = { success: true };
    } else {
      options.filePath = filePath;
      result = await caskFs.deleteFile(options);
    }
    res.status(200).json(result);
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;
export { silentJson };
