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
    @container (min-width: 600px) {
      .mobile-view {
        display: none;
      }
      .desktop-view {
        display: block;
      }
    }
    button.item-line {
      all: unset;
      display: flex;
      align-items: center;
      gap: .5rem;
      width: 100%;
      cursor: pointer;
    }
    .is-directory .type-icon {
      color: var(--ucd-blue-80, #13639e);
    }
    .is-file .type-icon {
      color: var(--ucd-black-80, #333);
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
      <button class='item-line' @click=${() => console.log(this.data)}>
        <cork-icon icon=${this.isDirectory ? 'fas.folder' : 'fas.file'} class='type-icon'></cork-icon>
        <div>${this.name}</div>
      </button>
    </div>
  `
}