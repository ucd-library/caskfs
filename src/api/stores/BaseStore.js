import {BaseStore} from '@ucd-lib/cork-app-utils';
import { Registry, STATES } from '@ucd-lib/cork-app-utils';

export default class BaseStoreImp extends BaseStore {

  constructor() {
    super();
  }

  set(payload, store, eventName) {
    super.set(payload, store, eventName);
    const AppStateModel = Registry.models['AppStateModel'];
    if ( !AppStateModel ) return;

    if ( payload.state === STATES.LOADING) {
      AppStateModel.addLoadingRequest({payload})
    } else if ( payload.state === STATES.LOADED) {
      AppStateModel.removeLoadingRequest({payload})
    } else if ( payload.state === STATES.ERROR) {
      let errorSettings = this.errorSettings?.[store.name];
      AppStateModel.removeLoadingRequest({payload});
      AppStateModel.addErrorRequest({payload, errorSettings});
    }
  }
}
