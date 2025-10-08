import { html, css, nothing } from 'lit';
import { ref } from 'lit/directives/ref.js';

export function styles() {
  const elementStyles = css`
    cork-app-dialog-modal {
      display: block;
    }
    cork-app-dialog-modal dialog::backdrop {
      background-color: black;
      opacity: 0.5;
    }
    cork-app-dialog-modal dialog {
      border: none;
      padding: 1rem 0;
      border-radius: 1rem;
      animation: dialog-fade-out 0.5s ease-out;
      margin: 0;
      overflow-y: hidden;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 95%;
      z-index: 1000;
    }
    @media (min-width: 768px) {
      cork-app-dialog-modal dialog {
        width: 75%;
      }
    }
    @media (min-width: 992px) {
      cork-app-dialog-modal dialog {
        width: auto;
      }
    }
    cork-app-dialog-modal dialog[open] {
      animation: dialog-fade-in 0.5s ease-out;
    }
    cork-app-dialog-modal dialog[open]::backdrop {
      animation: dialog-backdrop-fade-in 0.5s ease-out forwards;
    }
    @keyframes dialog-fade-in {
      0% {
        opacity: 0;
        display: none;
      }

      100% {
        opacity: 1;
        display: block;
      }
    }

    @keyframes dialog-fade-out {
      0% {
        opacity: 1;
        display: block;
      }

      100% {
        opacity: 0;
        display: none;
      }
    }

    @keyframes dialog-backdrop-fade-in {
      0% {
        background-color: rgb(0 0 0 / 0%);
      }

      100% {
        background-color: rgb(0 0 0 / 25%);
      }
    }
    cork-app-dialog-modal .alignable-promo__buttons {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
      padding: 1rem 1rem 0 1rem;
    }
    cork-app-dialog-modal .heading-wrapper {
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--ucd-black-20, #E5E5E5);
    }
    cork-app-dialog-modal .heading {
      display: flex;
      justify-content: space-between;
      gap: 2rem;
      padding: 0 1rem;
    }
    cork-app-dialog-modal .heading .h4 {
      margin: 0;
    }
    cork-app-dialog-modal .buttons-wrapper {
      border-top: 1px solid var(--ucd-black-20, #E5E5E5);
    }
    cork-app-dialog-modal .modal-content {
      padding: 1rem 2rem;
      overflow-y: scroll;
    }
    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }
    cork-app-dialog-modal .btn cork-icon {
      animation: spin 3s linear infinite;
      margin-right: 0.5rem;
    }
  `;

  return [elementStyles];
}

export function render() {
return html`
  <dialog ${ref(this.dialogRef)}>
    <div ?hidden=${!this.modalTitle} class='heading-wrapper'>
      <div class='heading'>
        <div class='h4'>${this.modalTitle}</div>
        <cork-icon-button icon='fas.xmark' @click=${() => this._onButtonClick('dismiss')} basic></cork-icon-button>
      </div>
    </div>
    <div class='modal-content' style='max-height: ${this.contentMaxHeight || 'none'}'>
      ${this.modalContent ? this.modalContent() : nothing}
    </div>
    <div class='buttons-wrapper'>
      <div class='alignable-promo__buttons'>
        ${this.actions.map(action => html`
          <div class=${action.color ? 'category-brand--' + action.color : ''}>
            <button
              ?disabled=${action.disableOnLoading && this._loading}
              @click=${e => this._onButtonClick(action.value)}
              class='btn btn--${action.invert ? 'invert' : 'primary'}'>
              <span ?hidden=${!(action.disableOnLoading && this._loading)}>
                <cork-icon icon='fa.solid.spinner'></cork-icon>
              </span>
              <span>${action.text}</span>
            </button>
          </div>
        `)}
      </div>
    </div>
  </dialog>
`;}
