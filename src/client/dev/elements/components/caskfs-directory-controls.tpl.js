import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    [hidden] {
      display: none !important;
    }

    .container {
      display: flex;
      gap: .5rem;
      align-items: center;
      flex-wrap: wrap;
      justify-content: space-around;
    }
    @media (min-width: 480px) {
      .container {
        justify-content: flex-start;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div class='container'>
    <cork-icon-button 
      icon="fas.folder-plus" 
      title="Create Empty Folder" 
      link-aria-label="Create Empty Folder">
    </cork-icon-button>
    <cork-icon-button 
      icon="fas.upload" 
      title="Upload Files" 
      @click=${this._onUploadClick}
      link-aria-label="Upload Files">
    </cork-icon-button>
    <cork-icon-button
      icon='fas.turn-up'
      title='Up One Level'
      ?disabled=${this.directoryPathCtl.path.length <= 1}
      @click=${() => this.directoryPathCtl.moveUp()}
      link-aria-label='Up One Level'>
    </cork-icon-button>
    <cork-icon-button 
      icon='fas.sort'
      title='Sort Items'
      @click=${this._onSortClick}
      link-aria-label='Sort Items'>
    </cork-icon-button>
    <cork-icon-button
      icon='fas.copy'
      title='Copy Directory Path'
      @click=${this._onCopyPathClick}
      link-aria-label='Copy Directory Path'>
    </cork-icon-button>
    <cork-icon-button
      icon='fas.trash'
      color='medium'
      title='Delete Selected Items'
      ?hidden=${!this.itemSelectCtl.selected.length}
      @click=${this._onBulkDeleteClick}
      link-aria-label='Delete Selected Items'>
    </cork-icon-button>
  </div>

`;}