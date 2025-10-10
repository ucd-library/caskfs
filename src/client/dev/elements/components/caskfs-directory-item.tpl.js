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
    @container (min-width: 775px) {
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
      box-sizing: border-box;
      grid-template-columns: 1fr 30px;
    }
    .desktop-view .item-line {
      grid-template-columns: 3fr 1fr 1fr 1.5fr 1fr 30px;
    }
    .item-line:hover {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    .item-line:focus-within {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    .is-selected .item-line {
      background-color: var(--ucd-blue-30, #EBF3FA);
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
    .link-button--align-top {
      align-items: flex-start;
    }
    .link-button--align-top cork-icon {
      margin-top: .25rem;
    }

    .delete-icon {
      --cork-icon-button-size: 1.25rem;
      margin-top: 2px;
    }
    .date-container {
      display: flex;
      flex-wrap: wrap;
      gap: .25rem;
    }
    .date-container > div {
      white-space: nowrap;
    }
    .name-container {
      display: flex;
      align-items: flex-start;
      gap: .5rem;
    }
    .name-container input[type='checkbox'] {
      margin: .4rem 0 0 0
    }
    .details {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      font-size: var(--font-size--small, .75rem);
      margin-top: .75rem;
    }
    .select-visible .details {
      margin-left: 1.25rem;
    }

    @container (min-width: 400px) {
      .details {
        max-width: 500px;
        flex-wrap: wrap;
        flex-direction: row;
        justify-content: space-between;
      }

    }
  `;

  return [elementStyles];
}

export function render() { 
  const classes = {
    'is-directory': this.isDirectory,
    'is-file': !this.isDirectory,
    'is-selected': this.selectCtl.hostIsSelected,
    'select-hidden': this.hideSelect,
    'select-visible': !this.hideSelect
  };
  return html`
    <div class=${classMap(classes)}>
      ${renderMobileView.call(this)}
      ${renderDesktopView.call(this)}
    </div>
`;}

function renderMobileView(){
  return html`
    <div class='mobile-view'>
      <div class='item-line'>
        <div>
          ${renderName.call(this)}
          <div class='details'>
            <div>
              <div>Kind:</div>
              <div>${this.kind}</div>
            </div>
            <div>
              <div>Size:</div>
              <div>${this.size}</div>
            </div>
            <div>
              <div>Modified:</div>
              ${renderModifiedDate.call(this)}
            </div>
            <div>
              <div>Modified By:</div>
              <div>${this.modifiedBy}</div>
            </div>
          </div>
        </div>
        ${renderDeleteIcon.call(this)}
      </div>
    </div>
  `
}

function renderDesktopView(){
  return html`
    <div class='desktop-view'>
      <div class='item-line'>
        ${renderName.call(this)}
        <div>${this.kind}</div>
        <div>${this.size}</div>
        ${renderModifiedDate.call(this)}
        <div>${this.modifiedBy}</div>
        ${renderDeleteIcon.call(this)}
      </div>
    </div>
  `
}

function renderDeleteIcon(){
  return html`
    <cork-icon-button 
      @click=${this._onDeleteClick}
      class='delete-icon'
      icon='fas.trash' 
      basic
      link-aria-label='Delete Item'
      title='Delete Item'>
    </cork-icon-button>
  `;
}

function renderName(){
  return html`
    <div class='name-container'>
      <input type='checkbox' 
        ?hidden=${this.hideSelect}
        @input=${this._onSelectToggle} 
        .checked=${this.selectCtl.hostIsSelected} 
        aria-label='Select Item'>
      <button @click=${this._onItemClick} class='link-button link-button--bold link-button--align-top'>
        <cork-icon icon=${this.isDirectory ? 'fas.folder' : 'fas.file'} class='type-icon'></cork-icon>
        <div>${this.name}</div>
      </button>
    </div>
  `;
}

function renderModifiedDate(){
  return html`
    <div class='date-container'>
      <div>${this.modifiedDate}</div> 
      <div>${this.modifiedTime}</div>
    </div>
  `;
}