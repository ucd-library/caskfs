import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskf-sort-form {
      display: block;
    }
    caskf-sort-form .sort-options {
      margin-bottom: 2rem;
    }
    caskf-sort-form .sort-option {
      display: flex;
      align-items: flex-start;
      gap: .5rem;
      padding: 1rem 0;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
    }
    caskf-sort-form .sort-option:last-child {
      border-bottom: none;
    }
    caskf-sort-form .sort-option select {
      width: initial;
    }
    caskf-sort-form .sort-option-inputs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem;
      flex-grow: 1;
    }
    caskf-sort-form .sort-option-label {
      width: 5rem;
      font-weight: 700;
      margin-top: .5rem;
      color: var(--ucd-blue);
    }
    caskf-sort-form .sort-option-delete {
      --cork-icon-button-size: 1.25rem;
      margin-top: .5rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <form @submit="${this._onSubmit}">
      <div class='sort-options'>
        ${this.selected.map((s, idx) => _renderOption.call(this, s, idx))}
      </div>
      <button 
        class='btn btn--invert' 
        type='button'
        @click=${this._onAddClick}
        ?disabled=${this._options.length === this.selected.length}>
        ${this.selected.length ? 'Add another sort column' : 'Add a sort column'}
      </button>
    </form>
  `;}

function _renderOption(opt, idx ){
  const _option = this._options.find(o => o.field === opt.field) || {};
  const directionOptions = this.getDirectionOptions(_option.type);

  return html`
    <div class='sort-option'>
      <div class='sort-option-label'>${idx === 0 ? 'Sort by:' : 'Then by:'}</div>
      <div class='sort-option-inputs'>
        <select
          .value=${opt.field}
          name='sort-field-${idx}'
          aria-label='Select Sort Field'
          @input=${e => this._onOptionInput(idx, 'field', e.target.value)}
          >
          <option value=''>-- Select Field --</option>
          ${this._options.map(o => html`
            <option 
              value=${o.field} 
              ?disabled=${this.selected.some(s => s.field === o.field) && o.field !== opt.field}
              ?selected=${o.field === _option.field}>${o.label}
          </option>`)}
        </select>
        <select
          .value=${opt.isDesc ? 'desc' : 'asc'}
          name='sort-direction-${idx}'
          aria-label='Select Sort Direction'
          @input=${e => this._onOptionInput(idx, 'isDesc', e.target.value === 'desc')}
          ?disabled=${!opt.field}
          >
          ${directionOptions.map(o => html`<option value=${o.value} ?selected=${(o.value === 'desc') === opt.isDesc}>${o.label}</option>`)}
        </select>
      </div>
      <div class='sort-option-delete'>
        <cork-icon-button
          icon='fas.trash'
          basic
          title='Remove Sort Option'
          link-aria-label='Remove Sort Option'
          ?hidden=${this.selected.length <= 1}
          @click=${() => this._onRemoveOption(idx)}
        ></cork-icon-button>
      </div>
    </div>
  `
}