import { html, css } from 'lit';

import breadcrumbStyles from '@ucd-lib/theme-sass/4_component/_nav-breadcrumbs.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    .breadcrumbs {
      padding: 0;
      margin: 0;
    }
  `;

  return [
    breadcrumbStyles,
    elementStyles
  ];
}

export function render() { 
return html`
  <ol class='breadcrumbs'>
    ${this.ctl.directoryPath.breadcrumbs.map(crumb => crumb.currentPage ? html`<li>${crumb.name}</li>` : html`<li><a href="${crumb.url}">${crumb.name}</a></li>`)}
  </ol>
`;}