import { LitElement } from 'lit';
import { render } from "./caskf-sort-form.tpl.js";

import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import ModalFormController from '../../controllers/ModalFormController.js';
import QueryStringController from '../../controllers/QueryStringController.js';

export default class CaskfSortForm extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {
      options: { type: Array },
      _options: { state: true },
      selected: { type: Array },
      modalTitle: { type: String, attribute: 'modal-title'  },
      submitText: { type: String, attribute: 'submit-text' }
    }
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.modalTitle = 'Sort Options';
    this.submitText = 'Sort';

    this.options = [];
    this.selected = [];

    this.ctl = {
      qs: new QueryStringController(this),
      modal: new ModalFormController(this, {title: this.modalTitle, submitText: this.submitText, submitCallback: '_onSubmitClick'})
    }

    this._injectModel('AppStateModel');
  }

  willUpdate(props){
    if ( props.has('modalTitle') ) {
      this.ctl.modal.setModalTitle(this.modalTitle);
    }
    if ( props.has('submitText') ) {
      this.ctl.modal.setModalSubmitButton(this.submitText);
    }
    if ( props.has('options') ) {
      this.resetState();
    }
  }

  resetState(){
    this.ctl.qs.syncState();
    const sort = this.ctl.qs.sort;
    const selected = [];
      this._options = this.options.map(opt => {
      const out = {
        field: typeof opt === 'string' ? opt : opt?.field || opt?.value
      };
      if ( !out.field ) return null;
      out.label = opt.label || out.field;
      out.type = opt.type || 'string';
      const existing = sort.find(s => s.field === out.field);
      if ( existing ) {
        selected.push({field: out.field, isDesc: existing.isDesc});
      }
      return out;
    }).filter(opt => opt);

    if ( selected.length ){
      this.selected = selected;
    } else {
      this.selected = [{field: '', isDesc: false}];
    }
  }

  _onAppDialogOpen(){
    if ( this.ctl.modal.modal ) {
      this.resetState();
    }
  }

  async _onSubmitClick(){
    await this.submit();
  }

  _onSubmit(e){
    e.preventDefault();
    if ( this.ctl.modal.modal ){
      this.ctl.modal.submit();
    } else {
      this._onSubmitClick();
    }
  }

  async submit(){
    this.ctl.qs.sort = this.selected.filter(s => s.field);
    this.ctl.qs.setParam('page', 1);
    this.ctl.qs.setLocation();
  }

  _onAddClick(){
    this.selected.push({field: '', isDesc: false});
    this.requestUpdate();
  }

  _onOptionInput(idx, prop, value){
    this.selected[idx][prop] = value;
    this.requestUpdate();
  }

  _onRemoveOption(idx){
    this.selected.splice(idx, 1);
    this.requestUpdate();
  }

  getDirectionOptions(type){
  let directionOptions = [
    { label: 'A to Z', value: 'asc' },
    { label: 'Z to A', value: 'desc' },
  ];
  if ( type === 'number' ) {
    directionOptions = [
      { label: 'Smallest to Largest', value: 'asc' },
      { label: 'Largest to Smallest', value: 'desc' },
    ];
  }
  if ( type === 'date' ) {
    directionOptions = [
      { label: 'Oldest to Newest', value: 'asc' },
      { label: 'Newest to Oldest', value: 'desc' },
    ];
  }
  return directionOptions;
}

}

customElements.define('caskf-sort-form', CaskfSortForm);