import crypto from 'crypto';
import fs from 'fs';
import git from '../../lib/git.js';

/**
 * @function hashFile
 * @description Compute the sha256 hex digest of a file using a streaming read.
 * @param {String} filePath - absolute path to the file
 * @returns {Promise<String>}
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data',  chunk => hash.update(chunk));
    stream.on('end',   ()    => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Message handler — receives { id, filePath } from the parent process,
 * computes the sha256 hash and git repo info, and replies with
 * { id, filePath, hash, gitInfo }.  Errors are returned as { id, filePath, error }.
 */
process.on('message', async ({ id, filePath }) => {
  try {
    const hash = await hashFile(filePath);

    let gitInfo = null;
    try { gitInfo = await git.info(filePath); } catch(e) {}

    process.send({ id, filePath, hash, gitInfo });
  } catch(err) {
    process.send({ id, filePath, error: err.message });
  }
});
