import { html, css } from 'lit';
import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    caskf-system-stats {
      display: block;
    }
    caskf-system-stats h2 {
      margin-top: 2rem;
    }
    caskf-system-stats .scroll-x {
      overflow-x: auto;
    }
    caskf-system-stats .table-header {
      border-bottom: 2px solid var(--ucd-gold-80, #FFD24C);
      font-weight: 700;
      padding: 1rem .5rem;
      box-sizing: border-box;
    }
    caskf-system-stats .row {
      border-bottom: 1px solid var(--ucd-blue-60, #B0D0ED);
      padding: 1rem .5rem;
      box-sizing: border-box;
    }
    caskf-system-stats .row:hover {
      background-color: var(--ucd-gold-30, #FFF9E6);
    }
    caskf-system-stats .stats-grid {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
      gap: .5rem;
      min-width: 20rem;
    }
    caskf-system-stats .stats-grid .metric {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    caskf-system-stats .stats-grid a {
      color: var(--ucd-blue, #022851);
      text-decoration: none;
    }
    caskf-system-stats .stats-grid a:hover {
      text-decoration: underline;
    }
    caskf-system-stats .table-sizes-grid {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 2fr);
      gap: .5rem;
      min-width: 40rem;
    }
  `;

  return [elementStyles];
}

function renderStatRow(opts) {
  const { href, icon, value, label } = opts;
  return html`
    <div class="row stats-grid">
      <div class="metric">
        <cork-icon icon=${icon}></cork-icon>
        <a href=${href}>${label}</a>
      </div>
      <div>${value}</div>
    </div>
  `;
}

export function render() {
  return html`
    <h2>System Statistics</h2>
    <div class="scroll-x">
      <div class="table-header stats-grid">
        <div>Metric</div>
        <div>Value</div>
      </div>
      <div>
        ${renderStatRow({
          href: appUrlUtils.fullLocation('file-search'),
          icon: 'fas.file',
          value: this.stats.total_files || 0,
          label: 'Total Files'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('directory'),
          icon: 'fas.folder',
          value: this.stats.total_directories || 0,
          label: 'Total Directories'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('config/partitions'),
          icon: 'fas.layer-group',
          value: this.stats.total_partition_keys || 0,
          label: 'Partition Keys'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('statistics'),
          icon: 'fas.fingerprint',
          value: this.stats.total_hashes || 0,
          label: 'Total Hashes'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('statistics'),
          icon: 'fas.hard-drive',
          value: this.stats.diskUsage?.total_size_pretty || '0',
          label: 'File Size on Disk'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('rel'),
          icon: 'fas.filter',
          value: this.stats.total_ld_filters || 0,
          label: 'LD Filters'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('rel'),
          icon: 'fas.link',
          value: this.stats.total_ld_links || 0,
          label: 'LD Links'
        })}
        ${renderStatRow({
          href: appUrlUtils.fullLocation('rel'),
          icon: 'fas.quote-right',
          value: this.stats.total_ld_literals || 0,
          label: 'LD Literals'
        })}
      </div>
    </div>
    <h2 ?hidden=${!this.stats.pgTableSizes?.length}>Database Table Sizes</h2>
    <div class="scroll-x" ?hidden=${!this.stats.pgTableSizes?.length}>
      <div class="table-header table-sizes-grid">
        <div>Table</div>
        <div>Total Size</div>
        <div>Table Size</div>
        <div>Indexes Size</div>
      </div>
      <div>
        ${(this.stats.pgTableSizes || []).map(table => html`
          <div class="row table-sizes-grid">
            <div>${table.table_name}</div>
            <div>${table.total_size}</div>
            <div>${table.table_size}</div>
            <div>${table.indexes_size}</div>
          </div>
        `)}
      </div>
    </div>
  `;
}
