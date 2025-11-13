import { LitElement } from 'lit';
import {render, styles} from "./caskfs-autopath-list.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import Prism from 'prismjs';
import 'prismjs/components/prism-regex.js';
import 'prismjs/components/prism-javascript.js';

import AppComponentController from '../../controllers/AppComponentController.js';

export default class CaskfsAutopathList extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      type: { type: String },
      rules: { type: Array }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);

    this.type = '';
    this.rules = [];

    this._injectModel('AppStateModel', 'AutoPathModel');

    this.ctl = {
      appComponent: new AppComponentController(this)
    };
  }

  willUpdate(props){
    if ( props.has('type') ) {
      const allowedTypes = ['partition', 'bucket'];
      if ( !allowedTypes.includes(this.type) ) {
        this.type = allowedTypes[0];
      }
    }
  }
  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.getRules();
  }

  async getRules() {
    this.rules = [];
    const res = await this.AutoPathModel.list(this.type);
    if ( res.state === 'loaded' ) {
      this.rules = res.payload.map( rule => {

        // highlight regex
        let regex = rule.filter_regex;
        if ( regex ) {
          try {
            regex = Prism.highlight(
              rule.filter_regex,
              Prism.languages.regex, 
              'regex'
            );
          } catch (e) {
            console.error('Error highlighting regex:', e);
          }
        }

        // highlight get_value function
        let valueFunc = rule.get_value;
        if ( valueFunc ) {
          valueFunc = `/** 
 * @description Extracts partition key value from the matched path part
 * @param {string} name - The name of the auto path rule
 * @param {string} pathValue - The portion of the path that matched the regex
 * @param {object} regexMatch - The full regex match result of JavaScripts 'String.match' function.
 */
function getPartitionValue(name, pathValue, regexMatch) {
  ${rule.get_value}
}`;
          try {
            valueFunc = Prism.highlight(
              valueFunc,
              Prism.languages.javascript, 
              'javascript'
            );
          } catch (e) {
            valueFunc = rule.get_value;
            console.error('Error highlighting get_value function:', e);
          }
        }
        return {
          rule,
          hasIndex: rule.index !== undefined && rule.index !== null,
          valueFuncDisplayed: false,
          regexHtml: regex,
          valueFuncHtml: valueFunc
        }
      });
    }
  }

  _onValueFuncToggleClick(rule){
    rule.valueFuncDisplayed = !rule.valueFuncDisplayed;
    this.requestUpdate();
  }

}

customElements.define('caskfs-autopath-list', CaskfsAutopathList);