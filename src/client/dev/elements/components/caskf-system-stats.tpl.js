import { html, css } from 'lit';

export function styles() {
  const elementStyles = css`
    caskf-system-stats {
      display: block;
      container-type: inline-size;
    }
    caskf-system-stats cork-icon {
      --cork-icon-size: 2em;
    }
    caskf-system-stats .system-stats__factoids {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
      margin-top: 1rem;
    }

    @container (min-width: 400px) {
      caskf-system-stats .system-stats__factoids {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @container (min-width: 600px) {
      caskf-system-stats .system-stats__factoids {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `;

  return [elementStyles];
}

export function render() { 
  return html`
    <div class='system-stats__factoids'>
      <div class="category-brand--rec-pool">
        <div class="factoid factoid--brackets">
          <a href="/directory" class="factoid__link">
            <div class="factoid__bracket-one"></div>
            <div class="factoid__bracket-wrapper">
              <div class="factoid__figure factoid__icon">
                <cork-icon icon="fas.file"></cork-icon>
              </div>
              <div class="factoid__body">
                <h2 class="factoid__big-text">${this.stats.total_files}</h2>
                <h3 class="factoid__small-text no-wrap">Total Files</h3>
              </div>
            </div>
            <div class="factoid__bracket-two"></div>
          </a>
        </div>
      </div>
      <div class="category-brand--thiebaud-icing">
        <div class="factoid factoid--brackets">
          <a href="/directory" class="factoid__link">
            <div class="factoid__bracket-one"></div>
            <div class="factoid__bracket-wrapper">
              <div class="factoid__figure factoid__icon">
                <cork-icon icon="fas.fingerprint"></cork-icon>
              </div>
              <div class="factoid__body">
                <h2 class="factoid__big-text">${this.stats.total_hashes}</h2>
                <h3 class="factoid__small-text">
                  <div class='no-wrap'>Total Hashes</div> 
                  <div class='no-wrap'>(${this.stats.unused_hashes} Unused)</div>
                </h3>
              </div>
            </div>
            <div class="factoid__bracket-two"></div>
          </a>
        </div>
      </div>
      <div class="category-brand--cabernet">
        <div class="factoid factoid--brackets">
          <a href="/config/partitions" class="factoid__link">
            <div class="factoid__bracket-one"></div>
            <div class="factoid__bracket-wrapper">
              <div class="factoid__figure factoid__icon">
                <cork-icon icon="fas.layer-group"></cork-icon>
              </div>
              <div class="factoid__body">
                <h2 class="factoid__big-text">${this.stats.total_partition_keys}</h2>
                <h3 class="factoid__small-text">
                  <div class='no-wrap'>Partitions</div>
                </h3>
              </div>
            </div>
            <div class="factoid__bracket-two"></div>
          </a>
        </div>
      </div>
    </div>


  `;
}