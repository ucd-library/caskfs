import fs from 'fs/promises';
import path from 'path';
import config from '../../lib/config.js';

/**
 * @function buildGitMetadata
 * @description Convert a git info object into a flat metadata object with `git-*` keys,
 * matching the format used by CaskFS write/sync internally.
 * @param {Object|null} gitInfo
 * @returns {Object}
 */
function buildGitMetadata(gitInfo) {
  if (!gitInfo) return {};
  const m = {};
  for (const key of config.git.metadataProperties) {
    if (gitInfo[key] != null) m[`git-${key}`] = gitInfo[key];
  }
  return m;
}

/**
 * @function dirExt
 * @description Extract the full extension from a filename (everything from the first dot).
 * @param {String} name
 * @returns {String}
 */
function dirExt(name) {
  const i = name.indexOf('.');
  return i >= 0 ? name.slice(i) : '';
}

/**
 * @function isSentinel
 * @description Return true if filename is a __file__ sentinel.
 * @param {String} name
 * @returns {Boolean}
 */
function isSentinel(name) {
  return name === '__file__' || name.startsWith('__file__.');
}

/**
 * @function crawlLocal
 * @description Recursively walk a local directory tree, applying the __file__ sentinel
 * convention.  A sentinel file (__file__ or __file__.[ext]) inside a local directory
 * represents the CaskFS file at that directory's own path; the sentinel extension must
 * exactly match the directory name's extension.
 *
 * @param {String} localDir - absolute path to the local source directory
 * @param {String} caskDir  - destination CaskFS path (e.g. '/data/reports')
 * @returns {Promise<{files: Array<{srcFile: String, destFile: String}>, errors: String[]}>}
 */
async function crawlLocal(localDir, caskDir) {
  const files  = [];
  const errors = [];

  async function walk(dir, caskPath) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch(e) {
      errors.push(`Cannot read directory ${dir}: ${e.message}`);
      return;
    }

    entries = entries.filter(e => !e.name.startsWith('.'));

    const sentinels = entries.filter(e => e.isFile() && isSentinel(e.name));

    if (sentinels.length > 1) {
      errors.push(`Multiple __file__ sentinels in ${dir}: ${sentinels.map(s => s.name).join(', ')}`);
      return;
    }

    if (sentinels.length === 1) {
      const sentinel    = sentinels[0];
      const dirName     = path.basename(dir);
      const expectedExt = dirExt(dirName);
      const sentinelExt = sentinel.name === '__file__' ? '' : sentinel.name.slice('__file__'.length);

      if (sentinelExt !== expectedExt) {
        errors.push(
          `Sentinel extension mismatch in ${dir}: directory is "${dirName}" ` +
          `(ext "${expectedExt}") but sentinel is "${sentinel.name}" (ext "${sentinelExt}")`
        );
        return;
      }

      // The sentinel's content becomes the CaskFS file at caskPath (the directory's own path)
      files.push({ srcFile: path.join(dir, sentinel.name), destFile: caskPath });
    }

    for (const entry of entries) {
      if (isSentinel(entry.name)) continue;

      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), path.posix.join(caskPath, entry.name));
      } else if (entry.isFile()) {
        files.push({ srcFile: path.join(dir, entry.name), destFile: path.posix.join(caskPath, entry.name) });
      }
    }
  }

  await walk(localDir, caskDir);
  return { files, errors };
}

/**
 * @function recursiveCaskLs
 * @description Recursively list all files under a CaskFS directory.
 * Returns a flat array of file objects with an added `filepath` property
 * (directory + '/' + filename).
 *
 * Handles virtual directories: a CaskFS path that is simultaneously a file
 * and a parent of other files. In this case, `ls` returns the path as a
 * file entry but not as a directory entry. This function detects virtual
 * dirs by attempting to walk each file path as a directory. In direct-pg
 * mode, ls on a non-directory returns empty with no error. In HTTP mode,
 * ls on a plain file path throws (409), which is caught and ignored.
 *
 * @param {Object} cask - CaskFS client
 * @param {String} directory - CaskFS directory to list recursively
 * @param {Object} [opts={}]
 * @param {String} [opts.requestor]
 * @returns {Promise<Array<{filepath: String, filename: String, directory: String}>>}
 */
async function recursiveCaskLs(cask, directory, opts={}) {
  const allFiles = [];

  async function walk(dir) {
    let offset = 0;
    const limit = 1000;

    while (true) {
      const result = await cask.ls({ directory: dir, limit, offset, requestor: opts.requestor });

      for (const file of (result.files || [])) {
        const filepath = path.posix.join(file.directory, file.filename);
        allFiles.push({ ...file, filepath });
        // Try walking this file path as a virtual directory — a path that is
        // both a file and a parent of other files. In direct-pg mode, ls on a
        // non-directory returns empty without error. In HTTP mode, ls on a
        // plain file path throws (the server returns 409), which we swallow.
        try {
          await walk(filepath);
        } catch(e) {
          // Not a directory — expected for plain files in HTTP mode
        }
      }
      for (const subDir of (result.directories || [])) {
        await walk(subDir.fullname);
      }

      const fetched = (result.files?.length || 0) + (result.directories?.length || 0);
      if (fetched < limit) break;
      offset += limit;
    }
  }

  await walk(directory);
  return allFiles;
}

export { buildGitMetadata, dirExt, isSentinel, crawlLocal, recursiveCaskLs };
