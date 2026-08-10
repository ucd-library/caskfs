import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: inline-block;
    }
    [hidden] {
      display: none !important;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      font-size: .8rem;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: .03em;
      padding: .2rem .6rem;
      border-radius: 1rem;
      background-color: var(--ucd-green-30, #E3F2E3);
      color: var(--ucd-green-100, #1B5E20);
      --cork-icon-size: .8rem;
    }
  `;

  return [elementStyles];
}

export function render() {
  if ( !this.isPublic ) return html``;

  return html`
    <div class="badge" title="This directory is publicly readable without authentication.">
      <cork-icon icon="fas.globe"></cork-icon>
      Public
    </div>
  `;
}
