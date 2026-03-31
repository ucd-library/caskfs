class UploadUtils {

  /**
   * Extract files from a drag event, including recursively collecting files from dropped directories.
   * @param {DragEvent} e
   * @returns {Promise<Array<{entry: FileSystemEntry, files: File[]}>>}
   */
  async getFilesFromDragEvent(e) {
    const items = Array.from(e.dataTransfer.items);
    const nested = await Promise.all(
      items.map(async item => {
        const entry = item.webkitGetAsEntry();
        if (!entry) return [];
        const files = await this.collectFiles(entry)
        return {entry, files};
      })
    );
    return nested;
  }

  normalizeFileName(file){
    let name = typeof file === 'string' ? file : file.webkitRelativePath || file.name || '';

    // substitute spaces with dashes
    name = name.replace(/\s/g, '-');

    return name;
  }

  /**
   * @description Join path parts into a single path, ensuring proper slashes.
   * @param {string[]} parts - array of path segments to join
   * @param {object} options
   * @param {boolean} options.leadingSlash - whether to ensure a leading slash
   * @param {boolean} options.trailingSlash - whether to ensure a trailing slash
   * @param {boolean} options.normalize - whether to normalize the file names
   * @returns {string}
   */
  joinPath(parts, { leadingSlash = false, trailingSlash = false, normalize = false } = {}) {
    let path = parts.filter(Boolean).map(p => p.replace(/^\/+|\/+$/g, '')).join('/');
    if (leadingSlash && !path.startsWith('/')) path = '/' + path;
    if (trailingSlash && !path.endsWith('/')) path = path + '/';
    if ( normalize) path = this.normalizeFileName(path);
    return path;
  }

  /**
   * Recursively collect all files from a FileSystemEntry.
   * @param {FileSystemEntry} entry
   * @param {string} path
   * @returns {Promise<File[]>}
   */
  async collectFiles(entry, path = '') {
    const files = [];
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      // attach the relative path manually since drag-drop doesn't set webkitRelativePath
      Object.defineProperty(file, 'relativePath', { value: path + file.name });
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      // must loop — readEntries only returns up to 100 entries per call
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        const nested = await Promise.all(batch.map(child => this.collectFiles(child, path + entry.name + '/')));
        files.push(...nested.flat());
      } while (batch.length > 0);
    }
    return files;
  }

  /**
   * Normalize files from any source into an array with a relativePath property.
   * @param {File[]} files
   * @returns {File[]}
   */
  normalizeFiles(files) {
    return Array.from(files).map(file => {
      if (!file.relativePath) {
        Object.defineProperty(file, 'relativePath', {
          value: file.webkitRelativePath || file.name
        });
      }
      return file;
    });
  }

}

export default new UploadUtils();