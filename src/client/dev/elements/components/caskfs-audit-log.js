import { LitElement } from 'lit';
import {render, styles} from "./caskfs-audit-log.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

/**
 * @description Full audit history for one file or directory, shown inside a dialog modal by
 * caskfs-page-file-single.js and caskfs-directory-controls.js. Not paginated - the backing API
 * always returns the resource's complete history. Fetches on connect, so nothing is requested
 * until the modal actually renders this component (see showDialogModal's `content` factory in
 * both callers - the component isn't created until the modal opens).
 * @property {String} resourcePath - file or directory path to show history for
 * @property {Boolean} isFile - true if resourcePath names a file, false for a directory
 */
export default class CaskfsAuditLog extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      resourcePath: { type: String },
      isFile: { type: Boolean },
      loading: { state: true },
      entries: { state: true },
      error: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.resourcePath = '';
    this.isFile = false;
    this.loading = false;
    this.entries = [];
    this.error = null;

    this._injectModel('AuditModel');
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  async _load() {
    this.loading = true;
    this.error = null;

    const res = await this.AuditModel.getLog(this.resourcePath, this.isFile);

    this.loading = false;
    if ( res.state === 'loaded' ) {
      this.entries = res.payload.entries;
    } else {
      this.error = 'Unable to load audit history for this resource.';
    }
  }

}

customElements.define('caskfs-audit-log', CaskfsAuditLog);
