import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden]{
      display: none !important;
    }
    input {
      padding-right: 2rem;
      box-sizing: border-box;
    }
    cork-icon {
      position: absolute;
      top: .75rem;
      right: .5rem;
      color: var(--ucd-blue-80, #13639e);
      --cork-icon-size: 1rem;
    }
    .input-container {
      position: relative;
      max-width: 250px;
    }
    .link-button {
      all: unset;
      cursor: pointer;
      color: var(--ucd-blue-80, #13639e);
      font-size: .875rem;
      font-weight: 700;
    }
    .link-button:hover, .link-button:focus, .link-button:active {
      color: var(--tahoe, #00b2e3);
    }
    .advanced-button {
      margin-top: .25rem;
      width: 100%;
      display: block;
    }
    @media (min-width: 768px) {
      .advanced-button {
        text-align: right;
      }
    }
  `;

  return [
    formStyles,
    elementStyles
  ];
}

export function render() { 
  const partitionCount = this.ctl.qs.query.partition.length;
  return html`
    <div>
      <form @submit=${this._onSubmit}>
        <div class='input-container'>
          <input
            type="text"
            placeholder="Apply a partition"
            aria-label="Apply a partition"
            .value=${this.ctl.qs.query.partition?.[0] || ''}
            @input=${e => this.ctl.qs.setParam('partition', e.target.value, {position: 0, update: true})}
          />
          <cork-icon icon="fas.layer-group"></cork-icon>
        </div>
      </form>
      <button class="link-button advanced-button" @click=${this.showModalForm} type="button">
        <span ?hidden=${partitionCount <= 1}>+${partitionCount - 1} additional partitions applied</span>
        <span ?hidden=${partitionCount > 1}>Apply Multiple Partitions</span>
      </button>
    </div>
  `;
}