import { html, css } from 'lit';

import IdGenerator from '../../utils/IdGenerator.js';
const idGen = new IdGenerator();

export function styles() {
  const elementStyles = css`
    caskfs-delete-form {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <form @submit=${this._onSubmit}>
    <div>
      <div ?hidden=${!this.isSingleFile}>
        <div class='double-decker bold u-space-mb'>Are you sure you want to delete this file?</div>
        <ul class='list--arrow'>
          <li>${this.items[0]?.filepath}</li>
        </ul>
      </div>
      <div ?hidden=${!this.isSingleDirectory}>
        <div class='double-decker bold u-space-mb'>Are you sure you want to delete this directory and all its contents?</div>
        <ul class='list--arrow'>
          <li>${this.items[0]?.name}</li>
        </ul>
      </div>
      <div ?hidden=${this.items.length < 2}>
        <div class='double-decker bold u-space-mb'>Are you sure you want to delete ${this.items.length} items?</div>
        TODO: make bulk delete endpoint
      </div>
    </div>
    <div class='field-container checkbox'>
      <input id=${idGen.get('soft-delete')} name=${idGen.get('soft-delete')} type="checkbox" .checked=${this.reqOptions.softDelete ? true : false} @input=${() => this._onInput('softDelete', !this.reqOptions.softDelete)}><label for=${idGen.get('soft-delete')}>Soft Delete</label>
    </div>
    
</form>
`;}