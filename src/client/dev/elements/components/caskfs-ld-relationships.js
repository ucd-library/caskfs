import { LitElement } from 'lit';
import { render, styles } from "./caskfs-ld-relationships.tpl.js";
import { LitCorkUtils, Mixin } from '@ucd-lib/cork-app-utils';

import DirectoryPathController from '../../controllers/DirectoryPathController.js';
import AppComponentController from '../../controllers/AppComponentController.js';
import QueryStringController from '../../controllers/QueryStringController.js';

export default class CaskfsLdRelationships extends Mixin(LitElement)
  .with(LitCorkUtils) {

  static get properties() {
    return {
      inbound: { type: Boolean },
      relationships: { type: Array },
      brandColor: { type: String, attribute: 'brand-color' }
    }
  }

  static get styles() {
    return styles();
  }

  constructor() {
    super();
    this.render = render.bind(this);
    this.inbound = false;
    this.relationships = [];
    this.brandColor = 'ucd-gold';

    this.ctl = {
      directoryPath: new DirectoryPathController(this),
      appComponent: new AppComponentController(this),
      qs: new QueryStringController(this, { types: { partition: 'array'}})
    };

    this._injectModel('AppStateModel', 'LdModel');
  }

  async _onAppStateUpdate(e) {
    if ( !this.ctl.appComponent.isOnActivePage ) return;
    this.getData();
  }

  async getData(){
    await this.ctl.qs.updateComplete;

    const query = {};
    if ( this.ctl.qs.query.partition?.length ) {
      query.partitionKeys = this.ctl.qs.query.partition;
    }
    
    const r = await this.LdModel.rel(
      this.ctl.directoryPath.pathname,
      query
    );
    if ( r.state !== 'loaded' ) return;

    this.relationships = Object.entries(r.payload[this.inbound ? 'inbound' : 'outbound'] || {}).map(([predicate, nodes]) => {
      const p = {
        predicate: {
          uri: predicate,
        },
        nodes: []
      };
      const predicateLastSegmentIdx = Math.max(predicate.lastIndexOf('#'), predicate.lastIndexOf('/'));
      if ( predicateLastSegmentIdx >= 0 ){
        p.predicate.lastSegment = predicate.slice(predicateLastSegmentIdx + 1);
        p.predicate.ns = predicate.slice(0, predicateLastSegmentIdx);
      } else {
        p.predicate.lastSegment = predicate;
        p.predicate.ns = '';
      }
      nodes.forEach(node => {
        p.nodes.push({
          uri: node,
          lastSegment: node.split('/').pop(),
          ns: node.split('/').slice(0, -1).join('/')
        });
      });
      return p;
    });
    
  }

  _onCopyFilePathClick(node) {
    navigator.clipboard.writeText(node.uri);
    this.AppStateModel.showToast({text: 'File path copied to clipboard', type: 'success'});
  }

}

customElements.define('caskfs-ld-relationships', CaskfsLdRelationships);