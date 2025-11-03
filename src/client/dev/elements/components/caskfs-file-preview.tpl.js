import { html, css, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import prismStyles from 'prismjs/themes/prism.css';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    pre {
      overflow-x: scroll;
      font-size: .875rem;
    }
    .loader {
      display: flex;
      align-items: center;
      gap: .5rem;
      font-size: 1rem;
      color: var(--ucd-blue, #022851);
    }
    .loader cork-icon {
      animation: spin 3s linear infinite;
      font-size: 1.5rem;
    }
    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }
  `;

  return [
    unsafeCSS(prismStyles),
    elementStyles
  ];
}

export function render() { 
  return html`
    <div ?hidden=${!this.loading} class='loader'>
      <cork-icon icon="fas.spinner"></cork-icon> Loading preview...
    </div>
    <div ?hidden=${this.loading}>
      ${_renderContents.call(this)}
    </div>
  `;
}

function _renderContents(){
  if ( this.previewType === 'json' ) {
    return html`
      <pre><code class="language-json">${unsafeHTML(this.fileContents)}</code></pre>
    `;
  }
  if ( this.previewType === 'image' ) {
    return html`
      <img src=${this.FsModel.fileDownloadUrl(this.filepath)} alt="Preview of image file ${this.filepath}" />
    `;
  }
  if ( this.previewType === 'text' ) {
    return html`
      <pre><code>${this.fileContents}</code></pre>
    `;
  }
  return html`
    <p>No preview available for this file type.</p>
  `;
}