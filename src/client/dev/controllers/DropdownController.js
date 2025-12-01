import { styleMap } from 'lit/directives/style-map.js';

/**
 * @typedef {Object} DropdownControllerOptions
 * @property {Number} hostFocusOutTime - Time in ms to wait before closing dropdown on host focus out. Default is 100ms.
 * @property {Number} defaultMaxHeight - Default max height of the dropdown in pixels. Default is 300px.
 * @property {Object} openCustomStyles - Custom styles to apply to the dropdown when open.
 * @property {Object} belowCustomStyles - Custom styles to apply to the dropdown when opened below the host.
 * @property {Object} aboveCustomStyles - Custom styles to apply to the dropdown when opened above the host.
 * @property {Number} spaceBuffer - Space in pixels to leave between the dropdown and the edge of the viewport. Default is 20px.
 */

/**
 * @description Controller to manage custom dropdown positioning and visibility
 * @property {Boolean} open - Whether the dropdown is open
 * @property {Object} styles - The computed styles for the dropdown based on its open state and position
 * @property {Object} styleMap - The styleMap directive for the dropdown styles
 * @param {LitElement} host The host element the controller is attached to
 * @param {DropdownControllerOptions} opts Options for configuring the dropdown behavior
 */
export default class DropdownController {

  constructor(host, opts={}) {
    this.host = host;
    host.addController(this);

    this._open = false;

    // options
    this.hostFocusOutTime = opts.hostFocusOutTime || 100;
    this.defaultMaxHeight = opts.defaultMaxHeight || 300;
    this.openCustomStyles = opts.openCustomStyles || {};
    this.belowCustomStyles = opts.belowCustomStyles || {};
    this.aboveCustomStyles = opts.aboveCustomStyles || {};
    this.spaceBuffer = opts.spaceBuffer || 20;

    // bind listeners
    this._onWindowResize = this._onWindowResize.bind(this);
    this._onHostFocusOut = this._onHostFocusOut.bind(this);
  }

  set open(value) {
    if ( !value ) value = false;
    if ( value ) value = true;
    if ( this._open === value ) return;
    this._open = value;
    this.host.requestUpdate();
  }

  get open() {
    return this._open;
  }

  get styles() {
    if ( !this.open ) return { display: 'none' };
    const hostRect = this.host.getBoundingClientRect();
    let styles = {
      maxWidth: `${hostRect.width}px`,
      display: 'block',
      position: 'absolute',
      zIndex: 10,
      width: '100%',
      ...this.openCustomStyles
    };

    const availableHeightBelow = Math.round(window.innerHeight - hostRect.bottom - this.spaceBuffer);
    if ( availableHeightBelow > 100 ) {
      styles.maxHeight = availableHeightBelow < this.defaultMaxHeight ? `${availableHeightBelow}px` : `${this.defaultMaxHeight}px`;
      Object.assign( styles, this.belowCustomStyles );
    } else {
      const availableHeightAbove = hostRect.top - this.spaceBuffer;
      styles.maxHeight = availableHeightAbove < this.defaultMaxHeight ? `${availableHeightAbove}px` : `${this.defaultMaxHeight}px`;
      styles.bottom = `${hostRect.height}px`;
      delete styles.top;
      Object.assign( styles, this.aboveCustomStyles );
    }

    return styles;
  }

  get styleMap() {
    return styleMap( this.styles );
  }

  _onWindowResize(){
    this.open = false;
  }

  _onHostFocusOut(){
    setTimeout(() => {
      if ( !this.host.renderRoot.activeElement ) {
        this.open = false;
      }
    }, this.hostFocusOutTime);
  }

  hostConnected() {
    window.addEventListener('resize', this._onWindowResize);
    this.host.addEventListener('focusout', this._onHostFocusOut);
    this.host.style.position = 'relative';
  }

  hostDisconnected() {
    window.removeEventListener('resize', this._onWindowResize);
    this.host.removeEventListener('focusout', this._onHostFocusOut);
  }

}