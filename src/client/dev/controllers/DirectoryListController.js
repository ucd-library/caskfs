import controllerUtils from '../utils/controllerUtils.js';
import { Registry } from '@ucd-lib/cork-app-utils';

import FsDisplayUtils from '../utils/FsDisplayUtils.js';

/**
 * @description Controller for managing directory listing contents and pagination
 * @property {LitElement} host The LitElement instance that is using this controller
 * @property {Object} opts Options for configuring the controller
 * @propery {Boolean} opts.parent If true, the controller will get the contents of the parent directory of the current path. Default is false.
 * @property {Number} totalPages The total number of pages for the current directory listing
 * @property {Array} contents The contents of the current directory listing
 */
export default class DirectoryListController {
  constructor(host, opts={}){
    this.host = host;
    controllerUtils.addController(host, this);

    this.opts = opts;

    this.DirectoryModel = Registry.getModel('DirectoryModel');

    this.totalPages = 0;
    this.contents = [];
  }

  get directoryPathCtl(){
    if ( this._directoryPathCtl ) return this._directoryPathCtl;
    this._directoryPathCtl = controllerUtils.getController(this.host, 'DirectoryPathController');
    return this._directoryPathCtl;
  }

  get qsCtl(){
    if ( this._qsCtl ) return this._qsCtl;
    this._qsCtl = controllerUtils.getController(this.host, 'QueryStringController');
    return this._qsCtl;
  }

  /**
   * @description Get the contents for the current directory path and query string parameters.
   * Sets 'contents' and 'totalPages' properties
   * @returns {Promise<void>}
   */
  async getContents(opts={}){
    await this.directoryPathCtl.updateComplete;
    await this.qsCtl.updateComplete;

    opts = {...this.opts, ...opts};

    this.qsCtl.pageSize = this.qsCtl.query.limit || 20;
    const query = {
      offset: this.qsCtl.pageOffset,
      limit: this.qsCtl.pageSize
    };
    if ( this.qsCtl.query.query ){
      query.query = this.qsCtl.query.query;
    }
    let path = this.directoryPathCtl.pathname;
    if ( opts.parent ) {
      const parent = this.directoryPathCtl.parentPath;
      if ( !parent ) {
        throw new Error('No parent directory for path: ' + path);
      }
      path = parent;
    }
    const res = await this.DirectoryModel.list(path, query);
    if ( res.state !== 'loaded' ) {
      this.contents = [];
      this.host.requestUpdate();
      return;
    }
    let contents = [];
    for ( const dir of res.payload.directories ) {
      if ( opts.asDisplayItems ) {
        contents.push(new FsDisplayUtils(dir));
        continue;
      }
      contents.push({
        data: dir,
        name: dir.name.split('/').filter(Boolean).pop(),
        lastModified: new Date(Math.round(new Date(dir.modified).getTime() / 1000) * 1000),
        size: 0,
        kind: 'directory',
        modifiedBy: ''
      });
    }

    for ( const file of res.payload.files ) {
      if ( opts.asDisplayItems ) {
        contents.push(new FsDisplayUtils(file));
        continue;
      }
      contents.push({
        data: file,
        name: file.filename,
        lastModified: new Date(Math.round(new Date(file.modified).getTime() / 1000) * 1000),
        size: Number(file.size),
        kind: file.meta_data?.mimeType || '',
        modifiedBy: file.last_modified_by || ''
      });
    }

    this.totalPages = this.qsCtl.maxPages(res.payload.totalCount);
    this.contents = contents;
    this.host.requestUpdate();
  }
}