import { html, css } from 'lit';

import '../components/caskfs-ld-relationships.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-relationships {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div class="l-container">
      <div class="l-3col">
        <div class="l-second">
          <p>main node goes here</p>
        </div>
        <div class="l-first">
          <caskfs-ld-relationships inbound></caskfs-ld-relationships>
        </div>
        <div class="l-third">
          <caskfs-ld-relationships></caskfs-ld-relationships>
        </div>
      </div>
    </div>
  `;}