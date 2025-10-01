import { html, css } from 'lit';

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
    <div><h1 class="page-title">Directory</h1></div>
    <ol class="breadcrumbs"><li>Directory</li></ol>
    <div class="l-container l-basic--flipped">
      <div class="l-content">
      </div>
      <div class="l-sidebar-second">
      </div>
    </div>
  </div>
`;}