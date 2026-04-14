import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskfs-upload-button {
      display: block;
    }
    caskfs-upload-button .dropdown {
      background: white;
      border: 1px solid var(--ucd-blue-30, #b8d4ec);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    caskfs-upload-button .dropdown button {
      all: unset;
      display: flex;
      align-items: center;
      gap: .5rem;
      width: 100%;
      padding: .25rem .5rem;
      cursor: pointer;
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
      box-sizing: border-box;
    }
    caskfs-upload-button .dropdown button:last-child {
      border-bottom: none;
    }
    caskfs-upload-button .dropdown button:hover, caskfs-upload-button .dropdown button:focus {
      background-color: var(--ucd-gold-30, #FFF9E6);
      color: inherit;
    }

    .suggestion-item:hover, .suggestion-item:focus {
      background-color: var(--ucd-gold-30, #FFF9E6);
      color: inherit;
    }
    caskfs-upload-button input[type="file"] {
      display: none;
    }
  `;

  return [elementStyles];
}

export function render() {
return html`
  <cork-icon-button
    icon="fas.upload"
    title="Upload Files"
    link-aria-label="Upload Files"
    @click=${this._onButtonClick}>
  </cork-icon-button>

  <div class="dropdown" style=${this.ctl.dropdown.styleMap}>
    <button @click=${this._onChooseFilesClick}>
      <cork-icon icon="fas.file"></cork-icon>
      Upload Files
    </button>
    <button @click=${this._onChooseFolderClick}>
      <cork-icon icon="fas.folder"></cork-icon>
      Upload Folder
    </button>
  </div>

  <input
    class="input-files"
    type="file"
    multiple
    @change=${this._onFileInputChange}>

  <input
    class="input-folder"
    type="file"
    webkitdirectory
    @change=${this._onFileInputChange}>
`;}
