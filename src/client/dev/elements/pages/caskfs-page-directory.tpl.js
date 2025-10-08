import { html, css } from 'lit';
import '../components/caskfs-directory-controls.js';
import '../components/caskfs-directory-list.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-directory {
      display: block;
    }
    caskfs-page-directory .content {
      display: block;
    }
    caskfs-page-directory caskfs-directory-controls {
      margin-bottom: 1rem;
    }

    @media (min-width: 480px) {
      caskfs-page-directory .content {
        display: flex;
        gap: 1rem;
      }
      caskfs-page-directory .content caskfs-directory-controls {
        width: 55px;
      }
      caskfs-page-directory .spacer {
        border-bottom: none;
        border-right: 2px dotted var(--ucd-gold, #ffbf00);
        height: auto;
        align-self: stretch;
      }
      
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div>
    <div class="l-container u-space-mt--large">
      <div class='content'>
        <caskfs-directory-controls path-start-index="1"></caskfs-directory-controls>
        <div class='spacer'></div>
        <caskfs-directory-list path-start-index="1"></caskfs-directory-list>
      </div>
    </div>
  </div>
`;}