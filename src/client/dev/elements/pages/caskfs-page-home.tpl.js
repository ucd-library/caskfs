import { html, css } from 'lit';

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
    homepage
  </div>
`;}