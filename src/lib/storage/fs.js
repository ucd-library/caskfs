import fsp from 'fs/promises';
import fs from 'fs';

class FSStorage {
  constructor() {
  }


  /**
   * @method createReadStream
   * @description Create a readable stream for a file, optionally bounded to a byte range.
   * @param {String} filePath - Absolute path to the file.
   * @param {Object} [opts={}]
   * @param {Number} [opts.start] - First byte offset (inclusive).
   * @param {Number} [opts.end] - Last byte offset (inclusive).
   * @returns {ReadableStream}
   */
  createReadStream(filePath, opts={}) {
    const streamOpts = {};
    if (opts.start !== undefined) streamOpts.start = opts.start;
    if (opts.end !== undefined) streamOpts.end = opts.end;
    return fs.createReadStream(filePath, streamOpts);
  }

  readFile(filePath, opts={}) {
    return fsp.readFile(filePath, {encoding: opts.encoding || null});
  }

  writeFile(filePath, data, opts={}) {
    return fsp.writeFile(filePath, data, {encoding: opts.encoding || null});
  }

  copyFile(localPath, fsPath, opts={}) {
    return fsp.copyFile(localPath, fsPath);
  }

  exists(filePath) {
    return new Promise((resolve) => {
      resolve(fs.existsSync(filePath));
    });
  }

  unlink(filePath) {
    return fsp.unlink(filePath);
  }

  mkdir(dirPath, opts={}) {
    return fsp.mkdir(dirPath, opts);
  }

}

export default FSStorage;