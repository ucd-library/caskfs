import { Router, json } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { pipeline } from 'stream/promises';
import { Validator } from './validate.js';
import { MissingResourceError } from '../lib/errors.js';

const router = Router();

const METADATA_ACCEPT = 'application/vnd.caskfs.file-metadata+json';

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
    const metadata = await caskFs.metadata({filePath, corkTraceId: req.corkTraceId});

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

    const readStream = await caskFs.read({filePath, corkTraceId: req.corkTraceId}, readOpts);

    // Clean up if the client disconnects mid-transfer
    req.on('aborted', () => {
      if (readStream?.destroy) readStream.destroy();
    });

    await pipeline(readStream, res);

  } catch (e) {

    // If file does not exist, check if a directory exists at that path
    if ( e instanceof MissingResourceError ) {
      try {
        const exists = await caskFs.exists({filePath});
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

function getWriteOptions(req) {
  let opts = {
    filePath: req.params[0],
  }

  if (req.query.mimeType) {
    opts.mimeType = req.query.mimeType;
  }
  if( req.get('x-cask-hash') ) {
    opts.hash = req.get('x-cask-hash');
  } else {
    opts.readStream = req;
  }

  if (req.method === 'PUT') {
    opts.replace = true;
  }
  return opts;
}

// only allow new file
router.post(/(.*)/, async (req, res) => {
  try {
    let opts = getWriteOptions(req);
    let result = await caskFs.write(opts);
    res.status(201).json({
      filePath: result.data.filePath,
      actions: result.data.actions
    });
  } catch (e) {
    return handleError(res, req, e);
  }
});

// allow upsert via put
router.put(/(.*)/, async (req, res) => {
  try {
    let opts = getWriteOptions(req);

    let result = await caskFs.write(opts);
    res.status(201).json({
      filePath: result.data.filePath,
      actions: result.data.actions
    });
  } catch (e) {
    return handleError(res, req, e);
  }
});

// metadata updates via patch
router.patch(/(.*)/, (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

router.delete(/(.*)/, json(), async (req, res) => {
  try {
    const filePath = req.params[0] || '/';
    const validator = new Validator({
      softDelete: { type: 'boolean' },
      directory: { type: 'boolean' }
    });
    const options = validator.validate({...req.query, ...(req.body || {}) });
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
