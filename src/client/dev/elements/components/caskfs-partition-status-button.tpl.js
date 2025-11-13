import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
      cork-prefixed-icon-button {
        font-size: 0.875rem;
      }
    }
    [hidden]{
      display: none !important;
    }
  `;

  return [elementStyles];
}

export function render() { 
  const partitionCount = this.ctl.qs.query.partition.length;
  return html`
    <div ?hidden=${partitionCount}>
      <cork-prefixed-icon-button @click=${this.showModalForm} color='light' icon='fas.layer-group'>Apply Partition</cork-prefixed-icon-button>
    </div>
    <div ?hidden=${!partitionCount}>
      <cork-prefixed-icon-button @click=${this.showModalForm} color='dark' icon='fas.layer-group'>Edit Partition${partitionCount > 1 ? 's' : ''}</cork-prefixed-icon-button>
    </div>
`;}