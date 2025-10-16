export default class FsDisplayUtils {

  constructor(metadata, options={}){
    this.metadata = metadata;

    this.missingValue = options.missingValue || '--';

  }

  get name(){
    if ( !this.metadata ) return this.missingValue;
    return (this.metadata?.file_id ? this.metadata.filename : this.metadata?.name?.split('/').filter(Boolean).pop()) || this.missingValue;
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