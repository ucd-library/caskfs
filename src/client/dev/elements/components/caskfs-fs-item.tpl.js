import { html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

import appUrlUtils from '../../utils/appUrlUtils.js';

// see caskfs-fs-items.js for styles

export function render() { 
  const classes = {
    'is-directory': this.fsUtils.isDirectory,
    'is-file': !this.fsUtils.isDirectory,
    'is-selected': this.selectCtl.hostIsSelected,
    'select-hidden': this.hideSelect,
    'select-visible': !this.hideSelect,
    'hide-type-icon': this.hideTypeIcon,
    'show-type-icon': !this.hideTypeIcon
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
      <div class='item-line row-grid'>
        <div>
          ${renderName.call(this)}
          <div class='details'>
            <div>
              <div>Kind:</div>
              <div>${this.fsUtils.kind}</div>
            </div>
            <div class='field--size'>
              <div>Size:</div>
              <div>${this.fsUtils.size}</div>
            </div>
            <div>
              <div>Modified:</div>
              ${renderModifiedDate.call(this)}
            </div>
            <div>
              <div>Modified By:</div>
              <div>${this.fsUtils.modifiedBy}</div>
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
      <div class='item-line row-grid'>
        ${renderName.call(this)}
        <div class='item-cell'>${this.fsUtils.kind}</div>
        <div class='item-cell field--size'>${this.fsUtils.size}</div>
        ${renderModifiedDate.call(this)}
        <div class='item-cell'>${this.fsUtils.modifiedBy}</div>
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
        @input=${() => this.selectCtl.toggle()} 
        .checked=${this.selectCtl.hostIsSelected} 
        aria-label='Select Item'>
      <div>
        <a class='name-link' href=${this.fsUtils.link}>
          <cork-icon icon=${this.fsUtils.isDirectory ? 'fas.folder' : 'fas.file'} class='type-icon'></cork-icon>
          <div class='name-text'>${this.fsUtils.name}</div>
        </a>
        <div ?hidden=${!(this.showDirectoryLink && this.fsUtils.directory) }>
          <a class='directory-link' href=${appUrlUtils.fullPath(`/directory/${this.fsUtils.directory}`)}>${this.fsUtils.directory}</a>
        </div>
      </div>

    </div>
  `;
}

function renderModifiedDate(){
  return html`
    <div class='date-container'>
      <div>${this.fsUtils.modifiedDate}</div> 
      <div>${this.fsUtils.modifiedTime}</div>
    </div>
  `;
}