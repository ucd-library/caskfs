import { html, css } from 'lit';
import buttonStyles from '@ucd-lib/theme-sass/2_base_class/_buttons.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .detail-row {
      margin-bottom: 1rem;
    }
    .detail-label {
      font-size: .875rem;
      font-weight: 700;
      color: var(--ucd-black-70, #4c4c4c);
    }
    .detail-value {
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .confirm-message {
      color: var(--double-decker, #c10230);
      font-weight: 700;
      margin-bottom: 1rem;
    }
  `;

  return [
    buttonStyles,
    elementStyles
  ];
}

function renderDetails() {
  const created = this.item.created ? new Date(this.item.created) : null;
  return html`
    <div class='detail-row'>
      <div class='detail-label'>File Path</div>
      <div class='detail-value'>${this.item.path}</div>
    </div>
    <div class='detail-row'>
      <div class='detail-label'>Relation</div>
      <div class='detail-value'>${this.item.relation}</div>
    </div>
    <div class='detail-row' ?hidden=${!this.item.metadata}>
      <div class='detail-label'>Metadata</div>
      <div class='detail-value'>${this.item.metadata}</div>
    </div>
    <div class='detail-row' ?hidden=${!created || isNaN(created.getTime())}>
      <div class='detail-label'>Recorded</div>
      <div class='detail-value'>${created && !isNaN(created.getTime()) ? created.toLocaleString() : ''}</div>
    </div>
    <a class='btn btn--primary' href=${this.item.link}>Go To File</a>
  `;
}

function renderConfirm() {
  return html`
    <div class='confirm-message'>Are you sure you want to remove this lineage link?</div>
    <div class='detail-row'>
      <div class='detail-label'>Relation</div>
      <div class='detail-value'>${this.item.relation}</div>
    </div>
    <div class='detail-row'>
      <div class='detail-label'>File Path</div>
      <div class='detail-value'>${this.item.path}</div>
    </div>
  `;
}

export function render() {
  return this.confirming ? renderConfirm.call(this) : renderDetails.call(this);
}
