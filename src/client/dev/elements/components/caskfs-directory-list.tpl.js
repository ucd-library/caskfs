import { html, css } from 'lit';
import './caskfs-directory-item.js';

export function styles() {
  const elementStyles = css`
    caskfs-directory-list {
      display: block;
      width: 100%;
    }
    caskfs-directory-list .breadcrumbs {
      padding: 0;
      margin-top: .5rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div>
      <ol class='breadcrumbs'>${this.directoryPathCtl.breadcrumbs.map(crumb => crumb.currentPage ? html`<li>${crumb.name}</li>` : html`<li><a href="${crumb.url}">${crumb.name}</a></li>`)}</ol>
      <div>
        <div ?hidden=${!this.contents.length}>
          ${this.contents.map(item => html`
            <caskfs-directory-item 
              @item-click=${e => this._onItemClick(e)}
              .data=${item.data}>
            </caskfs-directory-item>
          `)}
        </div>
        <div ?hidden=${this.contents.length}>This directory is empty</div>
      </div>
    </div>
  `;
}