import { html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import buttonStyles from '@ucd-lib/theme-sass/2_base_class/_buttons.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: none;
      position: fixed;
      background-color: var(--white, #fff);
      width: 100%;
      height: 100vh;
      z-index: 1001;
      top: 0;
    }
    .container {
      height: 100%;
      padding: 1rem;
      display: flex;
      justify-content: center;
    }
    .content {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      max-width: 500px;
      width: 100%;
    }
    .icon {
      color: var(--redbud, #c6007e);
      --cork-icon-size: 5rem;
      animation: pulse-color 5s infinite ease-in-out;
    }
    @keyframes pulse-color {
      0% {
        color: var(--redbud, #c6007e);
      }
      50% {
        color: var(--double-decker, #c10230);
      }
      100% {
        color: var(--redbud, #c6007e);
      }
    }
    .heading {
      margin: .75em 0 .25em;
      padding: 0;
      font-style: normal;
      font-weight: 800;
      line-height: 1.2;
      color: var(--forced-contrast-heading-primary, #022851);
      font-size: 1.42rem;
      font-style: inherit;
      align-self: flex-start;
    }
    .btn {
      box-sizing: border-box;
      margin-top: 1rem;
    }
    [hidden] {
      display: none !important;
    }
    .errors {
      box-sizing: border-box;
      width: 100%;
      margin-bottom: 2rem;
      margin-top: .5rem;
    }
    pre {
      font-size: .75rem;
      margin: 0;
    }
    .error-details {
      overflow-x: scroll;
      margin-left: .5rem;
      box-sizing: border-box;
      margin-top: .5rem;
    }
    .error-detail {
      margin-bottom: .5rem;
    }
    .error-detail > div:first-child {
      color: var(--ucd-blue, #022851);
      font-weight: 700;
      font-size: .875rem;
    }
    .error-heading {
      color: #13639e;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
    }
    .error-heading:hover {
      text-decoration: underline;
      color: #001124;
    }
    .error {
      margin-bottom: 1rem;
    }
    .buttons {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: .5rem;
      flex-wrap: wrap;
    }
    .auth-warning {
      color: var(--double-decker, #c10230);
      font-weight: 700;
      width: 100%;
    }
  `;

  return [
    buttonStyles,
    elementStyles
  ];
}

export function render() {
return html`
  <div class="container">
    <div class='content'>
    <div class='icon'>
      <cork-icon icon='fas.plug-circle-exclamation' invisible-if-empty></cork-icon>
    </div>
    <div class='heading' ?hidden=${!this.heading}>${this.heading}</div>
    <div ?hidden=${!this.errors.length} class='errors'>
      ${this.errors.map(error => html`
        <div class='error'>
          <div class='error-heading' @click=${() => this.toggleDetails(error)}>${error.heading}</div>
          <div class='error-details' ?hidden=${!error.showDetails}>
            <div ?hidden=${!error.url} class='error-detail'>
              <div>URL</div>
              <pre>${error.url}</pre>
            </div>
            <div ?hidden=${!error.details} class='error-detail'>
              <div>Details</div>
              <pre>${unsafeHTML(JSON.stringify(error.details, null, 2))}</pre>
            </div>
          </div>
        </div>
      `)}
    </div>
    <div class='buttons'>
      <a class='btn btn--primary btn--round' @click=${() => window.location.reload(true)}>Reload Page</a>
    </div>

    </div>
  </div>
`;}
