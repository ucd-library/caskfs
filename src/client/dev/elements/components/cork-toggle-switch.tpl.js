import { html, css, unsafeCSS } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import mdcSwitchStyles from "@material/switch/dist/mdc.switch.min.css";

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .container {
      display: flex;
      align-items: var(--cork-toggle-switch-align-items, center);
      justify-content: var(--cork-toggle-switch-justify-content, flex-start);
      gap: var(--cork-toggle-switch-gap, 0.5rem);
    }
    label {
      font-size: var(--cork-toggle-switch-label-font-size, 1rem);
      color: var(--cork-toggle-switch-label-color, var(--ucd-blue, #022851));
      font-weight: var(--cork-toggle-switch-label-font-weight, 700);
    }
    .mdc-switch {
      --mdc-switch-selected-track-color: var(--ucd-blue-60, #B0D0ED);
      --mdc-switch-selected-hover-track-color: var(--ucd-blue-60, #B0D0ED);
      --mdc-switch-selected-pressed-track-color: var(--ucd-blue-60, #B0D0ED);
      --mdc-switch-selected-focus-track-color: var(--ucd-blue-60, #B0D0ED);
      --mdc-switch-selected-handle-color: var(--ucd-blue-80, #13639E);
      --mdc-switch-selected-hover-handle-color: var(--ucd-blue-80, #13639E);
      --mdc-switch-selected-pressed-handle-color: var(--ucd-blue-80, #13639E);
      --mdc-switch-selected-focus-handle-color: var(--ucd-blue-80, #13639E);
      --mdc-switch-selected-hover-state-layer-color: var(--ucd-blue-30, #ebf3fa);
      --mdc-switch-selected-focus-state-layer-color: var(--ucd-blue-30, #ebf3fa);
      --mdc-switch-selected-pressed-state-layer-color: var(--ucd-blue-30, #ebf3fa);
      --mdc-switch-unselected-track-color: var(--ucd-black-20, #CCCCCC);
      --mdc-switch-unselected-hover-track-color: var(--ucd-black-20, #CCCCCC);
      --mdc-switch-unselected-pressed-track-color: var(--ucd-black-20, #CCCCCC);
      --mdc-switch-unselected-focus-track-color: var(--ucd-black-20, #CCCCCC);
      --mdc-switch-unselected-handle-color: var(--white, #FFFFFF);
      --mdc-switch-unselected-hover-handle-color: var(--white, #FFFFFF);
      --mdc-switch-unselected-pressed-handle-color: var(--white, #FFFFFF);
      --mdc-switch-unselected-focus-handle-color: var(--white, #FFFFFF);
      --mdc-switch-unselected-hover-state-layer-color: var(--ucd-blue-30, #ebf3fa);
      --mdc-switch-unselected-focus-state-layer-color: var(--ucd-blue-30, #ebf3fa);
      --mdc-switch-unselected-pressed-state-layer-color: var(--ucd-blue-30, #ebf3fa);

    }
  `;

  return [
    elementStyles,
    unsafeCSS(mdcSwitchStyles)
  ];
}

export function render() {
  const showLabelLeft = this.label && ['left', ''].includes(this.labelPosition);
  const showLabelRight = this.label && this.labelPosition === 'right';
  const showAriaLabel = this.label && this.labelPosition === 'none';
  return html`
  <div class='container'>
    <label ?hidden=${!showLabelLeft}>${this.label}</label>
    <button id="switch" @click=${this._onClick} class="mdc-switch" type="button" role="switch" aria-label=${ifDefined(showAriaLabel ? this.label : undefined)}>
      <div class="mdc-switch__track"></div>
      <div class="mdc-switch__handle-track">
        <div class="mdc-switch__handle">
          <div class="mdc-switch__shadow">
            <div class="mdc-elevation-overlay"></div>
          </div>
          <div class="mdc-switch__ripple"></div>
        </div>
      </div>
      <span class="mdc-switch__focus-ring-wrapper">
        <div class="mdc-switch__focus-ring"></div>
      </span>
    </button>
    <label ?hidden=${!showLabelRight}>${this.label}</label>
  </div>
`;}
