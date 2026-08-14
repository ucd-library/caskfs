import { Registry } from '@ucd-lib/cork-app-utils';
import controllerUtils from '../utils/controllerUtils.js';
import config from '../config.js';

/**
 * @description Controller for self-checking the current user's write/admin permission on a
 * directory, to decide whether to show write/admin-only UI controls (e.g. Create Folder,
 * Upload, Manage Access). Always reports true for both when ACL is disabled - permissions
 * aren't enforced server-side either way. Defaults to false ("deny") until a check resolves,
 * so controls stay hidden rather than flashing visible-then-hidden.
 */
export default class DirectoryPermissionController {

  constructor(host) {
    this.host = host;
    controllerUtils.addController(host, this);
    this.AclModel = Registry.getModel('AclModel');

    this.canWrite = false;
    this.canAdmin = false;
    this._checkedDirectory = null;
  }

  /**
   * @description Re-run the permission self-check if `directory` differs from the last one
   * checked. Safe to call on every render pass (e.g. from willUpdate/updated) - it no-ops once
   * a directory has already been (or is currently being) checked.
   * @param {String} directory
   */
  check(directory) {
    if ( directory === this._checkedDirectory ) return;
    this._checkedDirectory = directory;
    this._run(directory);
  }

  async _run(directory) {
    if ( !config.aclEnabled ) {
      this.canWrite = true;
      this.canAdmin = true;
      this.host.requestUpdate();
      return;
    }

    this.canWrite = false;
    this.canAdmin = false;

    const whoami = await this.AclModel.getWhoAmI();
    const username = whoami.state === 'loaded' ? whoami.payload?.username : null;
    if ( !username ) {
      this.host.requestUpdate();
      return;
    }

    const [writeRes, adminRes] = await Promise.all([
      this.AclModel.checkDirectoryPermission(directory, 'write'),
      this.AclModel.checkDirectoryPermission(directory, 'admin')
    ]);

    // the checked directory may have moved on again while this was in flight - a stale result
    // for a path we've since navigated away from shouldn't overwrite current state
    if ( directory !== this._checkedDirectory ) return;

    this.canWrite = writeRes.state === 'loaded' && !!writeRes.payload?.hasPermission;
    this.canAdmin = adminRes.state === 'loaded' && !!adminRes.payload?.hasPermission;
    this.host.requestUpdate();
  }

}
