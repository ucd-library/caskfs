import { html, css } from 'lit';
import '../components/caskf-system-stats.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-home {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div class='l-container u-space-mt--large'>
    <caskf-system-stats></caskf-system-stats>
  </div>
`;}