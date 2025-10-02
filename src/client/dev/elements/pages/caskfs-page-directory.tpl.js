import { html, css } from 'lit';
import '../components/caskfs-directory-controls.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-directory {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div>
    <div class="l-container u-space-mt--large">
      <caskfs-directory-controls></caskfs-directory-controls>
    </div>
  </div>
`;}