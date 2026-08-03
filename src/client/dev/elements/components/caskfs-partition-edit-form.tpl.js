import { html, css } from 'lit';
import formStyles from '@ucd-lib/theme-sass/1_base_html/_forms.css.js';
import buttonStyles from '@ucd-lib/theme-sass/2_base_class/_buttons.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    input {
      box-sizing: border-box;
    }
    input[type="text"] {
      max-width: 400px;
    }
    .add-partition {
      margin-top: 1rem;
      box-sizing: border-box;
      font-size: 1rem;
    }
    .partition-row {
      margin-bottom: .5rem;
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .auto-partitions {
      margin-bottom: 1rem;
    }
    .auto-partitions-label {
      font-size: .875rem;
      font-weight: 700;
      color: var(--ucd-black-70, #4c4c4c);
      margin-bottom: .5rem;
    }
    .auto-partition-row {
      color: var(--ucd-black-70, #4c4c4c);
    }
    .auto-partition-row .value {
      font-weight: 700;
    }
    .auto-partition-row .source {
      font-size: .875rem;
    }
  `;

  return [
    formStyles,
    buttonStyles,
    elementStyles
  ];
}

export function render() {
  return html`
    <form @submit=${this._onSubmit}>
      <div ?hidden=${!this.autoPartitions.length} class='auto-partitions'>
        <div class='auto-partitions-label'>Auto-applied (not editable)</div>
        ${this.autoPartitions.map(p => html`
          <div class="partition-row auto-partition-row">
            <cork-icon icon='fas.lock'></cork-icon>
            <span class="value">${p.value}</span>
            <span class="source">(auto: ${p.name})</span>
          </div>
        `)}
      </div>
      ${this.manualPartitions.map((partition, i) => html`
        <div class="partition-row">
          <input
            .value=${partition}
            type="text"
            placeholder="Partition key"
            @input=${e => this._onPartitionInput(i, e.target.value)}
          />
          <cork-icon-button
            icon='fas.trash'
            basic
            title='Remove Partition'
            link-aria-label='Remove Partition'
            @click=${() => this._onRemovePartitionClick(i)}>
          </cork-icon-button>
        </div>
      `)}
      <button
        class='btn btn--invert add-partition'
        type='button'
        @click=${this._onAddPartitionClick}>
        Add another partition
      </button>
    </form>
  `;
}
