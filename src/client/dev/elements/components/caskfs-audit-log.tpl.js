import { html, css } from 'lit';
import tableStyles from '@ucd-lib/theme-sass/1_base_html/_tables.css.js';

export function styles() {
  const elementStyles = css`
    :host {
      display: block;
    }
    [hidden] {
      display: none !important;
    }
    .status-message {
      color: var(--ucd-black-60, #666);
      padding: .5rem 0;
    }
    .status-message.error {
      color: var(--double-decker, #c10230);
    }
    table {
      width: 100%;
    }
    th {
      text-align: left;
      white-space: nowrap;
    }
    td {
      vertical-align: top;
    }
    .col-created {
      white-space: nowrap;
    }
    .col-details {
      word-break: break-word;
      overflow-wrap: anywhere;
    }
  `;

  return [
    tableStyles,
    elementStyles
  ];
}

/**
 * @description Render one operation's `details` JSONB payload as a short, human-readable
 * summary instead of a raw JSON dump. Falls back to a flat key: value list for any operation
 * without a specific formatter (including future operations added later).
 */
function formatDetails(operation, details) {
  if ( !details || Object.keys(details).length === 0 ) return '';

  if ( operation === 'file.write' && details.hash ) {
    return `hash ${details.hash.slice(0, 12)}…${details.size != null ? ` (${details.size} bytes)` : ''}`;
  }
  if ( (operation === 'file.move' || operation === 'directory.move') && details.fromPath ) {
    return `from ${details.fromPath} → ${details.toPath}`;
  }
  if ( operation === 'file.copy' && details.sourcePath ) {
    return `copied from ${details.sourcePath}`;
  }
  if ( operation === 'directory.set_public' ) {
    return details.public ? 'made public' : 'made private';
  }
  if ( operation === 'file.patch_metadata' && details.partitionKeys ) {
    return `partition keys: ${details.partitionKeys.join(', ')}`;
  }
  if ( operation === 'file.delete' && details.fileDeleted !== undefined ) {
    return details.fileDeleted
      ? 'file content removed from storage'
      : `file content retained (${details.referencesRemaining} reference(s) remaining)`;
  }

  return Object.entries(details)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`)
    .join(', ');
}

function renderRow(entry) {
  const created = entry.created ? new Date(entry.created) : null;
  return html`
    <tr>
      <td class='col-created'>${created && !isNaN(created.getTime()) ? created.toLocaleString() : entry.created}</td>
      <td>${entry.requestor}</td>
      <td>${entry.operation}</td>
      <td class='col-details'>${formatDetails(entry.operation, entry.details)}</td>
    </tr>
  `;
}

export function render() {
  return html`
    <div class='status-message' ?hidden=${!this.loading}>Loading audit history…</div>
    <div class='status-message error' ?hidden=${!this.error}>${this.error}</div>
    <div class='status-message' ?hidden=${this.loading || this.error || this.entries.length}>
      No audit history found for this resource.
    </div>
    <table ?hidden=${this.loading || this.error || !this.entries.length}>
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Action</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${this.entries.map(renderRow)}
      </tbody>
    </table>
  `;
}
