import fsp from 'fs/promises';
import fs from 'fs';

class FSStorage {
  constructor() {
  }


  createReadStream(filePath) {
    return fs.createReadStream(filePath);
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