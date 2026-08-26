import { LitElement, html } from 'lit';
import {render, styles} from "./caskfs-page-file-search.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';
import { MainDomElement } from "@ucd-lib/theme-elements/utils/mixins/main-dom-element.js";

import DirectoryItemSelectController from '../../controllers/DirectoryItemSelectController.js';
import QueryStringController from '../../controllers/QueryStringController.js';

export default class CaskfsPageFileSearch extends Mixin(LitElement)
  .with(LitCorkUtils, MainDomElement) {

  static get properties() {
    return {

    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.filters = [
      { value: 'subject', label: 'Subject', inputType: 'typeahead', suggestSource: 'uri' },
      { value: 'predicate', label: 'Predicate', inputType: 'typeahead', suggestSource: 'uri' },
      { value: 'object', label: 'Object', inputType: 'typeahead', suggestSource: 'uri' },
      { value: 'graph', label: 'Graph', inputType: 'typeahead', suggestSource: 'uri' },
      { value: 'type', label: 'Type', inputType: 'typeahead', suggestSource: 'uri' },
      { value: 'updatedAfter', label: 'Modified After', inputType: 'date' },
      { value: 'updatedBefore', label: 'Modified Before', inputType: 'date' },
      { value: 'partition', label: 'Partition', multiple: true, inputType: 'typeahead', suggestSource: 'partition-key' }
    ];

    this.ctl = {
      select: new DirectoryItemSelectController(this),
      qs: new QueryStringController(this, { types: { partition: 'array' } })
    };

    this._injectModel('AppStateModel');
  }

  _onBulkDeleteClick(){
    this.AppStateModel.showDialogModal({
      content: () => html`<caskfs-delete-form .items=${this.ctl.select.selected}></caskfs-delete-form>`,
    });
  }

}

customElements.define('caskfs-page-file-search', CaskfsPageFileSearch);