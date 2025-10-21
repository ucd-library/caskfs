import { Registry, getLogger } from '@ucd-lib/cork-app-utils';
import AppComponentController from './AppComponentController.js';

let CONTROLLERS = [];
let CTL_COUNT = 1;

/**
 * @description Controller for managing and accessing directory item selections
 * @property {LitElement} host The LitElement instance that is using this controller
 * @property {string} hostDataProperty Optional. If the host allows selecting a single item, use the property name that contains the item data
 */
export default class DirectoryItemSelectController {
  constructor(host, opts={}){
    this.host = host;
    host.addController(this);
    this.appComponentCtl = new AppComponentController(host);
    this.logger = getLogger('DirectoryItemSelectController');

    this.hostDataProperty = opts.hostDataProperty;

    this.id = CTL_COUNT++;
  }

  /**
   * @description Initialize DirectoryItemSelectController to listen for app state changes
   * Should only be called once when the app is initialized
   * Clears selection when navigating to a new directory
   */
  static init(){
    const AppStateModel = Registry.getModel('AppStateModel');
    AppStateModel.EventBus.on('app-state-update', (e) => {
      //if ( e.location.pathname === e.lastLocation.pathname ) return;
      DirectoryItemSelectController.clear();
    });
  }

  static get DirectoryModel(){
    return Registry.getModel('DirectoryModel');
  }

  get DirectoryModel(){
    return this.constructor.DirectoryModel;
  }

  /**
   * @description Emit update event to all controllers
   */
  static emitUpdate(){
    DirectoryItemSelectController.DirectoryModel.store.emit(DirectoryItemSelectController.DirectoryModel.store.events.DIRECTORY_ITEM_SELECT_UPDATE, {selected: DirectoryItemSelectController.DirectoryModel.store.selectedItems});
  }

  /**
   * @description Clear the selected items list
   */
  static clear(){
    DirectoryItemSelectController.DirectoryModel.store.selectedItems = [];
    DirectoryItemSelectController.emitUpdate();
  }

  /**
   * @description Clear the selected items list
   */
  clear(){
    this.constructor.clear();
  }

  /**
   * @description Get the list of selected items
   */
  get selected(){
    return this.DirectoryModel.store.selectedItems;
  }

  /**
   * @description The host's item is selected
   */
  get hostIsSelected(){
    return this.isSelected();
  }

  /**
   * @description All items on the current page are selected
   */
  get allSelected(){
    if ( !this.DirectoryModel.store.selectedItems.length ) return false;
    return CONTROLLERS.filter( c => c.appComponentCtl.isOnActivePage && c.hostDataProperty ).every( c => c.hostIsSelected );
  }

  /**
   * @description Check if an item is selected
   * @param {Object} item - Optional. The item to check. If not provided, will use the host's item (requires hostDataProperty to be set)
   * @returns {boolean}
   */
  isSelected(item){
    if ( !item ){ 
      item = this.host[this.hostDataProperty];
    }
    const fileId = item?.file_id;
    const directoryId = item?.directory_id;

    if ( fileId ){
      return this.DirectoryModel.store.selectedItems.some(i => i.file_id === fileId);
    }
    if ( directoryId ){
      return this.DirectoryModel.store.selectedItems.some(i => i.directory_id === directoryId && !i.file_id);
    }

    this.logger.warn('Item does not have file_id or directory_id', item, this.host);

    return false;
  }

  /**
   * @description Toggle selection of an item
   * @param {Object} item - Optional. The item to toggle. If not provided, will use the host's item (requires hostDataProperty to be set)
   */
  toggle(item){
    if ( !item ) item = this.host[this.hostDataProperty];
    const fileId = item?.file_id;
    const directoryId = item?.directory_id;
    if ( !fileId && !directoryId ){
      this.logger.warn('Item does not have file_id or directory_id', item);
      return;
    }

    if ( this.isSelected(item) ){
      this.DirectoryModel.store.selectedItems = fileId ?
        this.DirectoryModel.store.selectedItems.filter(i => i.file_id !== fileId) :
        this.DirectoryModel.store.selectedItems.filter(i => !(i.directory_id === directoryId && !i.file_id));
    } else {
      this.DirectoryModel.store.selectedItems.push(item);
    }

    this.emitUpdate();
  }

  /**
   * @description Toggle selection of all items on the current page
   */
  toggleAll(){
    if ( this.allSelected ) {
      this.DirectoryModel.store.selectedItems = [];
      this.emitUpdate();
    } else {
      this.DirectoryModel.store.emit(this.DirectoryModel.store.events.DIRECTORY_ITEM_SELECT_ALL);
    }
  }

  /**
   * @description Callback for when the selection list is updated
   */
  _onUpdate(){
    if ( !this.appComponentCtl.isOnActivePage ) return;
    this.host.requestUpdate();
  }

  /**
   * @description Callback for when there has been a request to select all items on the current page
   */
  _onSelectAll(){
    if ( !this.appComponentCtl.isOnActivePage ) return;
    if ( !this.host[this.hostDataProperty] ) return;
    if ( this.isSelected() ) return;
    this.DirectoryModel.store.selectedItems.push(this.host[this.hostDataProperty]);
    this.emitUpdate();
  }

  /**
   * @description Emit update that the selection list has changed
   */
  emitUpdate(){
    this.constructor.emitUpdate();
  }

  /**
   * @description Called when the host is connected to the DOM
   */
  hostConnected(){
    this.DirectoryModel.EventBus.on('directory-item-select-update', this._onUpdate.bind(this));
    this.DirectoryModel.EventBus.on('directory-item-select-all', this._onSelectAll.bind(this));
    CONTROLLERS.push(this);
  }

  /**
   * @description Called when the host is disconnected from the DOM
   */
  hostDisconnected(){
    this.DirectoryModel.EventBus.off('directory-item-select-update', this._onUpdate.bind(this));
    this.DirectoryModel.EventBus.off('directory-item-select-all', this._onSelectAll.bind(this));
    CONTROLLERS = CONTROLLERS.filter(c => c.id !== this.id);
  }
}