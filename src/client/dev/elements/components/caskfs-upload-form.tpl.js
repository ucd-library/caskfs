import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-upload-form {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <form @submit=${this._onSubmit}>
    <p>i am an upload form</p>
  </form>
`;}