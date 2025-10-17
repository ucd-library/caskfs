import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: none;
      position: fixed;
      background-color: var(--white, #fff);
      width: 100%;
      z-index: 1000;
      top: 0;
    }
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    .icon {
      z-index: 2;
      color: var(--ucd-blue, #022851);
      --cork-icon-size: 5rem;
      animation: pulse-color 5s infinite ease-in-out;
    }
    @keyframes ripple-animation {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      100% {
        transform: scale(3);
        opacity: 0;
      }
    }
    .icon-container {
      position: relative;
      width: 6rem;
      height: 6rem;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .ripple {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 2px solid var(--ucd-gold-50, #fde9ac);
      border-radius: 50%;
      animation: ripple-animation 2s infinite ease-out;
    }
    .ripple:nth-child(2) {
      animation-delay: 1s;
      opacity: 0;
      animation-fill-mode: forwards;
    }
    @keyframes pulse-color {
      0% {
        color: var(--ucd-blue, #022851);
      }
      50% {
        color: var(--ucd-blue-90, #14447a);
      }
      100% {
        color: var(--ucd-blue, #022851);
      }
    }
  `;

  return [elementStyles];
}

export function render() {
return html`
  <div class='container'>
    <div class='icon-container'>
      <div class='icon'>
        <cork-icon icon='ucdlib-core.ucdlib-logo'></cork-icon>
      </div>
      <div class="ripple"></div>
      <div class="ripple"></div>
    </div>
  </div>
`;}
