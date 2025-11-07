import appUrlUtils from "./appUrlUtils.js";

export default class FsDisplayUtils {

  constructor(metadata, options={}){
    this.metadata = metadata;

    this.missingValue = options.missingValue || '--';

  }

  get link(){
    if ( !this.metadata ) return null;
    if ( this.isDirectory ) {
      return appUrlUtils.fullPath(`/directory${this.metadata.fullname}`);
    } else {
      return appUrlUtils.fullPath(`/file${this.metadata.filepath}`);
    }
  }

  get name(){
    if ( !this.metadata ) return this.missingValue;
    if ( this.metadata.filename ) {
      return this.metadata.filename;
    }
    if ( this.metadata.name ){
      return this.metadata.name.split('/').filter(Boolean).pop();
    }
    if ( this.metadata.filepath ) {
      return this.metadata.filepath.split('/').filter(Boolean).pop();
    }
    return this.missingValue;
  }

  get directory(){
    if ( !this.metadata ) return this.missingValue;
    if ( this.metadata.directory ){
      return this.metadata.directory;
    }
    if ( this.metadata.filepath ) {
      const parts = this.metadata.filepath.split('/').filter(Boolean);
      parts.pop();
      return '/' + parts.join('/');
    }
    return this.missingValue;
  }

  get isDirectory(){
    if ( !this.metadata ) return false;
    return !this.metadata?.file_id;
  }

  get kind(){
    if ( !this.metadata ) return this.missingValue;
    return this.isDirectory ? 'directory' : this.metadata?.metadata?.mimeType || 'file';
  }

  get size(){
    if ( !this.metadata ) return this.missingValue;
    if ( this.isDirectory ) return this.missingValue;
    const size = this.metadata?.size;
    if ( !size || isNaN(Number(size)) ) return this.missingValue;

    const bytes = Number(size);
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    let displaySize = bytes;
    while (displaySize >= 1024 && i < units.length - 1) {
      displaySize /= 1024;
      i++;
    }
    return `${displaySize.toFixed(2)} ${units[i]}`;
  }


  get modifiedDate(){
    if ( !this.metadata?.modified ) return this.missingValue;
    const modified = new Date(this.metadata?.modified);
    if ( isNaN(modified.getTime()) ) return this.missingValue;
    return modified.toLocaleDateString();
  }

  get modifiedTime(){
    if ( !this.metadata?.modified ) return this.missingValue;
    const modified = new Date(this.metadata?.modified);
    if ( isNaN(modified.getTime()) ) return this.missingValue;
    return modified.toLocaleTimeString();
  }

  get modifiedBy(){
    return this.metadata?.last_modified_by || this.missingValue;
  }
}