import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-upload-tracker-toggle {
      display: block;
    }
    caskfs-upload-tracker-toggle .container {
      position: relative;
    }
    caskfs-upload-tracker-toggle .upload-indicator {
      position: absolute;
      color: var(--ucd-blue-80, #13639e);
      animation: spin 1s linear infinite;
      --cork-icon-size: 2.75rem;
      pointer-events: none;

    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div class='container'>
    <cork-icon-button 
      icon="fas.bars-progress" 
      title="${this.trackerVisible ? 'Hide' : 'Show'} Upload Tracker" 
      @click=${() => this.trackerVisible = !this.trackerVisible}>
    </cork-icon-button>
    <cork-icon
      class="upload-indicator"
      icon="fas.circle-notch"
      ?hidden=${!this.uploadInProgress}
    ></cork-icon>
  </div>
`;}