import { Registry } from '@ucd-lib/cork-app-utils';

const SCROLL_STATE = {
  scrollY: 0,
  history: []
};

/**
 * @description Controller to manage scroll position between page changes
 * @property {Object} host - The LitElement instance that is using this controller
 * @property {Object} opts - Options object
 * @property {boolean} opts.attachListener - If true (default false) attach scroll and app-state-update listeners.
 * Only one should be active at a time, so only use this option in the top level app component
 */
export default class ScrollController {
  constructor(host, opts={}){
    this.host = host;
    this.opts = opts;
    host.addController(this);
    this.AppStateModel = Registry.getModel('AppStateModel');
  }

  get scrollY() {
    return SCROLL_STATE.scrollY;
  }

  get lastPagePosition(){
    const currentPage = this.AppStateModel.store?.data?.page;
    if ( !currentPage ) return null;
    const hist = SCROLL_STATE.history;
    for ( let i = hist.length-1; i >= 0; i-- ) {
      if ( hist[i].page === currentPage ) {
        return hist[i].scrollY;
      }
    }
    return null;
  }

  /**
   * @description Scroll to last known scroll position for the current page
   * @returns
   */
  scrollToLastPagePosition(){
    const pos = this.lastPagePosition;
    if ( pos === null ) return;
    window.scrollTo(0, pos);
  }

  /**
   * @description Scroll to top of the window
   */
  scrollToTop(){
    window.scrollTo(0,0);
  }

  /**
   * @description Scroll to top of the host element
   */
  scrollToTopOfElement(noHeaderOffset){
    const rect = this.host.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    window.scrollTo(0, rect.top + scrollTop - (noHeaderOffset ? 0 : 65));
  }

  /**
   * @description Called when the host element is connected to the DOM
   */
  hostConnected() {
    if ( this.opts.attachListener ){
      window.addEventListener('scroll', this._onScroll.bind(this));
      this.AppStateModel.EventBus.on('app-state-update', this._onAppStateUpdate.bind(this));
    }

  }

  /**
   * @description Called when the host element is disconnected from the DOM
   */
  hostDisconnected() {
    if ( this.opts.attachListener ){
      window.removeEventListener('scroll', this._onScroll.bind(this));
      this.AppStateModel.EventBus.off('app-state-update', this._onAppStateUpdate.bind(this));
    }
  }

  /**
   * @description Handle scroll events
   */
  _onScroll(){
    SCROLL_STATE.scrollY = window.scrollY;
  }

  /**
   * @description Handle application state updates
   * Record scroll position for last page
   * @param {Object} e - app-state-update event object
   * @returns
   */
  _onAppStateUpdate(e) {
    if ( !e.lastPage ) return;
    if ( !SCROLL_STATE.scrollY ) return;
    SCROLL_STATE.history.push({page: e.lastPage, scrollY: SCROLL_STATE.scrollY});
    if ( SCROLL_STATE.history.length > 20 ) SCROLL_STATE.history.shift();
  }
}
