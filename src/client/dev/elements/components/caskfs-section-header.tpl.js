import { html, css } from 'lit';
import panelStyles from '@ucd-lib/theme-sass/4_component/_panel.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .h2 {
      margin: 0;
      padding: 0;
      color: var(--forced-contrast-heading-primary, #666);
      font-style: normal;
      font-weight: 800;
      line-height: 1.2;
      font-size: 1.6055rem;
    }
    @media (min-width: 768px) {
      .h2 {
        font-size: 2.0995rem;
      }
    }
    .container { 
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .container__main {
      display: flex;
      align-items: center;
      gap: .5rem;
      --cork-icon-size: 2rem;
    }
    .container__main cork-icon {
      color: var(--caskfs-section-header-brand-color);
    }
    .container__actions {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .panel__title {
      margin: 0;
    }
    .separator {
      width: 100%;
      border-bottom: 4px dotted var(--caskfs-section-header-brand-color);
      margin: 1rem 0;
    }
  `;

  return [
    panelStyles,
    elementStyles
  ];
}

export function render() { 
  return html`
    ${this.brandColor ? html`<style>:host { --caskfs-section-header-brand-color: var(--${this.brandColor}); }</style>` : ''}
    <div class="container">
      <div class="container__main">
        <cork-icon icon="${this.icon}" ?hidden="${!this.icon}"></cork-icon>
        <h2 class=${this._headingClass}>${this.text}</h2>
      </div>
      <div class="container__actions">
        <slot name="actions"></slot>
      </div>
    </div>
    <div class="separator"></div>
  `;}