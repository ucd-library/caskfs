import {BaseStore} from '@ucd-lib/cork-app-utils';
import { Registry, STATES } from '@ucd-lib/cork-app-utils';

export default class BaseStoreImp extends BaseStore {

  constructor() {
    super();
  }

  set(payload, store, eventName, opts={}) {
    super.set(payload, store, eventName);
    const AppStateModel = Registry.models['AppStateModel'];
    if ( !AppStateModel ) return;

    if ( payload.state === STATES.LOADING) {
      AppStateModel.addLoadingRequest({payload, loaderSettings: opts.loaderSettings || {}});
    } else if ( payload.state === STATES.LOADED) {
      AppStateModel.removeLoadingRequest({payload, loaderSettings: opts.loaderSettings || {}});
    } else if ( payload.state === STATES.ERROR) {
      AppStateModel.removeLoadingRequest({payload, loaderSettings: opts.loaderSettings || {}});
      AppStateModel.addErrorRequest({payload, errorSettings: opts.errorSettings || {}});
    }
  }
}
