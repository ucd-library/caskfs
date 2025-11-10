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
  `;

  return [
    formStyles,
    buttonStyles,
    elementStyles
  ];
}

export function render() { 
  const partitions = this.ctl.qs.query.partition;
  return html`
    <form @submit=${this._onSubmit}>
      ${partitions.map((partition, i) => html`
        <div class="partition-row">
          <input 
            .value=${partition}
            type="text"
            placeholder="TODO: This will be a typeahead input"
            @input=${e => this.ctl.qs.setParam('partition', e.target.value, {position: i, update: true})}
          />
          <cork-icon-button
            icon='fas.trash'
            basic
            title='Remove Partition'
            link-aria-label='Remove Partition'
            @click=${() => i > 0 ? this.ctl.qs.deleteParam('partition', {position: i}) : this.ctl.qs.setParam('partition', '', {position: i, update: true})}>
        </cork-icon-button>
        </div>
    `)}
      <button 
        class='btn btn--invert add-partition' 
        type='button'
        @click=${() => this.ctl.qs.setParam('partition', '', {append: true})}>
        Add another partition
      </button>
    </form>
  `;
}