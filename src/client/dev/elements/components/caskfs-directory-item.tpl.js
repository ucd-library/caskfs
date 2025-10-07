import { html, css } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    .desktop-view {
      display: none;
    }
    @container (min-width: 500px) {
      .mobile-view {
        display: none;
      }
      .desktop-view {
        display: block;
      }
    }
    .item-line {
      display: grid;
      align-items: stretch;
      gap: .5rem;
      width: 100%;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
      padding: 1rem .5rem;
      grid-template-columns: 3fr 1fr 1fr 1.5fr auto;
    }
    .item-line:hover {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    .item-line:focus-within {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
      
    .is-directory .type-icon {
      color: var(--ucd-blue-80, #13639e);
    }
    .is-file .type-icon {
      color: var(--ucd-black-80, #333);
    }
    .link-button {
      all: unset;
      cursor: pointer;
      color: var(--ucd-blue-80, #13639e);
      display: flex;
      align-items: center;
      gap: .5rem;
      align-self: start;
    }
    .link-button--bold {
      font-weight: 700;
    }
    .link-button:hover, .link-button:focus {
      color: var(--tahoe, #00b2e3);
    }
    .delete-icon {
      --cork-icon-button-size: 1.25rem;
      margin-top: 2px;
    }
    .keep-together {
      white-space: nowrap;
    }
    .date-container {
      display: flex;
      flex-wrap: wrap;
      gap: .25rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
  const classes = {
    'is-directory': this.isDirectory,
    'is-file': !this.isDirectory,
    'is-selected': this.selected
  };
  return html`
    <div class=${classMap(classes)}>
      <div></div>
      <div>
        ${renderMobileView.call(this)}
        ${renderDesktopView.call(this)}
      </div>
    </div>
`;}

function renderMobileView(){
  return html`
    <div class='mobile-view'>
      todo: Mobile View
    </div>
  `
}

function renderDesktopView(){
  return html`
    <div class='desktop-view'>
      <div class='item-line'>
        <div>
          <button @click=${this._onItemClick} class='link-button link-button--bold'>
            <cork-icon icon=${this.isDirectory ? 'fas.folder' : 'fas.file'} class='type-icon'></cork-icon>
            <div>${this.name}</div>
          </button>
        </div>
        <div>${this.kind}</div>
        <div>${this.size}</div>
        <div class='date-container'><div class='keep-together'>${this.modifiedDate}</div> <div class='keep-together'>${this.modifiedTime}</div></div>
        <cork-icon-button 
          @click=${this._onDeleteClick}
          class='delete-icon'
          icon='fas.trash' 
          basic
          link-aria-label='Delete Item'
          title='Delete Item'>
        </cork-icon-button>
      </div>
    </div>
  `
}