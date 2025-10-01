import { html, css } from 'lit';
import brandColorStyles from '@ucd-lib/theme-sass/4_component/_category-brand.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      position: fixed;
      bottom: 2rem;
      left: 2rem;
      z-index: 1001;
      margin-right: 2rem;
      max-width: 600px;
    }
    [hidden] {
      display: none !important;
    }
    .container {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: 1rem 1.5rem;
      border-radius: 5rem;
      background-color: var(--ucd-blue-20, #F7FAFD);
      box-shadow: 0px 3px 8px 0px rgba(0, 0, 0, 0.20);
      font-size: 1rem;
    }
  `;

  return [
    brandColorStyles,
    elementStyles
  ];
}

export function render() {
return html`
  <div class='container' ?hidden=${!this.currentToast}>
    <cork-icon icon=${this.currentToast?.icon} class=${this.currentToast?.brandColor} invisible-if-empty></cork-icon>
    <div>${this.currentToast?.text}</div>
  </div>
`;}
