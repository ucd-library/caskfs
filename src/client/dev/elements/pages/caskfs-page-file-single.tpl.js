import { html, css } from 'lit';

import '../components/caskfs-file-metadata.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-file-single {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`

  <div class="l-container u-space-mt--large">
    <caskfs-file-metadata path-start-index="1"></caskfs-file-metadata>
  </div>
  
`;}