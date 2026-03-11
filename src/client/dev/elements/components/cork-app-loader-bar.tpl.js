import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .container {
      position: relative;
      width: 100%;
      height: .5rem;
      background-color: var(--ucd-blue-40, #dbeaf7);
      overflow: hidden;
    }

    .sliding-segment {
      position: absolute;
      height: 100%;
      width: 40%;
      background: linear-gradient(
        90deg,
        var(--ucd-blue-80) 0%,
        var(--ucd-blue-100) 50%,
        var(--ucd-blue-80) 100%
      );
      animation: progress-slide 1.2s linear infinite;
      border-radius: 5rem;
    }

    @keyframes progress-slide {
      0% {
        left: -30%;
      }
      100% {
        left: 100%;
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div 
    class="container" 
    ?hidden="${!this.isDisplayed}"
    role="progressbar"
    aria-label="Loading"
    aria-valuetext="Loading"
    >
    <div class="sliding-segment"></div>
  </div>
`;}