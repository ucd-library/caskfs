import { html, css } from 'lit';
import './cork-sort-button.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    .container {
      display: flex;
      gap: .5rem;
      align-items: center;
      flex-wrap: wrap;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div class='container'>
    <cork-icon-button 
      icon="fas.folder-plus" 
      title="New Folder" 
      link-aria-label="New Folder">
    </cork-icon-button>
    <cork-icon-button 
      icon="fas.file-circle-plus" 
      title="New File" 
      link-aria-label="New File">
    </cork-icon-button>
    <cork-icon-button
      icon='fas.turn-up'
      title='Up One Level'
      ?disabled=${this.directoryPathCtl.path.length <= 1}
      @click=${() => this.directoryPathCtl.moveUp()}
      link-aria-label='Up One Level'>
    </cork-icon-button>
    <cork-sort-button 
      .options=${this.sortOptions} 
      @option-select=${this._onSortOptionSelect}
      .value=${this.qsCtl.query.sort || ''} 
      .isDesc=${this.qsCtl.query.sortDirection === 'desc'}>
    </cork-sort-button>
  </div>

`;}