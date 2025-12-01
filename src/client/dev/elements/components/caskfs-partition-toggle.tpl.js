import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden]{
      display: none !important;
    }
    .partition-row {
      margin-bottom: .5rem;
      gap: .25rem;
      display: flex;
      align-items: center;
      --cork-icon-button-size: 1.25rem;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div ?hidden=${!this._partitions.length}>
    ${this._partitions.map(p => html`
      <div class="partition-row ${p.applied ? 'applied' : ''}">
        <span>${p.name}</span>
        <cork-icon-button 
          icon=${p.applied ? 'fas.xmark' : 'fas.plus'}
          @click=${() => this.togglePartition(p)}
          link-aria-label=${p.applied ? 'Remove Partition' : 'Apply Partition'}
          title=${p.applied ? 'Remove Partition' : 'Apply Partition'}
        ></cork-icon-button>
      </div>
    `)}
  </div>
`;}