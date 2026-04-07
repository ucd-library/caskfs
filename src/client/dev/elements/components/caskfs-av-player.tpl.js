import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-av-player {
      display: block;
    }
    caskfs-av-player video, caskfs-av-player audio {
      max-width: 100%;
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
  if ( !this.src ) return html``;
  if ( this.video ) {
    return html`
      <video controls preload="metadata" src=${this.src}></video>
    `;
  }
  return html`
    <audio controls preload="metadata" src=${this.src}></audio>
  `;
}