import { LitElement } from 'lit';
import {render, styles} from "./caskfs-public-badge.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

/**
 * @description Small "publicly readable" indicator for a directory or file page, so a user
 * doesn't have to open the Manage Access modal to see that a directory's effective ACL (its
 * own or inherited) grants anonymous read access. Renders nothing when not public or not yet
 * loaded - this is a passive indicator, not an action, so it fails quiet rather than showing
 * an error state.
 * @param {String} directory - the directory path whose effective ACL should be checked
 */
export default class CaskfsPublicBadge extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      directory: { type: String },
      isPublic: { state: true }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.directory = '';
    this.isPublic = false;

    this._injectModel('AclModel');

    this._onAclChanged = this._onAclChanged.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('caskfs-directory-acl-changed', this._onAclChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('caskfs-directory-acl-changed', this._onAclChanged);
  }

  willUpdate(props) {
    if ( props.has('directory') && this.directory ) {
      this._load();
    }
  }

  /**
   * @description Re-check this directory's effective ACL whenever any directory's ACL changes
   * elsewhere on the page (e.g. the Manage Access modal). The change may be to an ancestor
   * directory this one inherits from, so any change is treated as potentially relevant rather
   * than filtering by path.
   * @param {CustomEvent} e - 'caskfs-directory-acl-changed' event
   */
  _onAclChanged(e) {
    if ( !this.directory ) return;
    this._load();
  }

  async _load() {
    const directory = this.directory;
    const res = await this.AclModel.getDirectoryAcl(directory, { errorSettings: { suppressError: true } });
    if ( directory !== this.directory ) return;
    this.isPublic = res.state === 'loaded' && !!res.payload.public;
  }

}

customElements.define('caskfs-public-badge', CaskfsPublicBadge);
