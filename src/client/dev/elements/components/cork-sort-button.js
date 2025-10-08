import { LitElement } from 'lit';
import {render, styles} from "./cork-sort-button.tpl.js";

export default class CorkSortButton extends LitElement {

  static get properties() {
    return {
      options: { type: Array },
      _options: { state: true },
      open: { type: Boolean },
      value: { type: String },
      valueDesc: { type: Boolean, attribute: 'value-desc'}
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.options = [];
    this.open = false;

    this.value = '';
    this.valueDesc = false;
  }

  connectedCallback(){
    super.connectedCallback();
    document.addEventListener('click', this._onDocumentClick.bind(this));
    document.addEventListener('keydown', this._onDocumentKeydown.bind(this));
  }

  disconnectedCallback(){
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocumentClick.bind(this));
    document.removeEventListener('keydown', this._onDocumentKeydown.bind(this));
  }

  willUpdate(props){
    if ( props.has('options') ) {
      this._options = (this.options || []).map(o => {
        if( typeof o === 'string' ) {
          return { label: o, value: o };
        }
        return o;
      });
    }
  }

  _onMainButtonClick(){
    this.open = !this.open;
  }

  _onOptionClick(option){
    if ( this.value === option.value ) {
      this.valueDesc = !this.valueDesc;
    } else {
      this.value = option.value;
      this.valueDesc = false;
    }

    this.dispatchEvent( new CustomEvent('option-select', {
      detail: {
        value: this.value,
        isDesc: this.valueDesc
      }
    }) );
  }

  _onDocumentClick(e){
    if ( !this.open ) return;
    if ( e.composedPath().includes(this) ) return;
    this.open = false;
  }

  _onDocumentKeydown(e){
    if ( !this.open ) return;
    if ( e.key === 'Escape' ) {
      this.open = false;
    }
  }

}

customElements.define('cork-sort-button', CorkSortButton);