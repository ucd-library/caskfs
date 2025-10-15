import { LitElement } from 'lit';
import {render, styles} from "./cork-toggle-switch.tpl.js";
import { MDCSwitch } from '@material/switch';

export default class CorkToggleSwitch extends LitElement {

  static get properties() {
    return {
      switch: {state: true},
      selected: {type: Boolean},
      disabled: {type: Boolean},
      label: {type: String},
      labelPosition: {type: String, attribute: 'label-position'}, // left, right, none
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.switch = undefined;
    this.selected = false;
    this.disabled = false;
    this.label = '';
    this.labelPosition = '';
  }

  get isLoaded(){
    return this.switch !== undefined;
  }

  willUpdate(props){
    if ( props.has('selected') || props.has('disabled') ) {
      this.updateSwitch();
    }
  }

  firstUpdated(){
    const ele = this.renderRoot.querySelector('#switch');
    if ( ele ) this.switch = new MDCSwitch(ele);
    this.dispatchEvent(new CustomEvent('cork-toggle-switch-loaded', {bubbles: true, composed: true}));

    this.updateSwitch();
  }

  updateSwitch(){
    if ( !this.isLoaded ) return;

    if ( this.disabled ){
      this.switch.disabled = true;
    } else {
      this.switch.disabled = false;
    }

    if ( this.selected ) {
      this.switch.selected = true;
    } else {
      this.switch.selected = false;
    }
  }

  async _onClick(){
    if ( !this.isLoaded ) return;

    // wait for the switch to update
    await new Promise(resolve => setTimeout(resolve, 100));

    // fire toggle event
    const event = new CustomEvent('cork-toggle-switch-change', {bubbles: true, composed: true, detail: {selected: this.switch.selected}});
    this.dispatchEvent(event);
  }

}

customElements.define('cork-toggle-switch', CorkToggleSwitch);