import { html, css } from 'lit';
import '../components/caskfs-autopath-list.js';
import appUrlUtils from '../../utils/appUrlUtils.js';

export function styles() {
  const elementStyles = css`
    caskfs-page-partitions {
      display: block;
    }
  `;

  return [elementStyles];
}

export function render() { 
return html`
  <div>
    <div><h1 class="page-title">Partitions</h1></div>
    <ol class="breadcrumbs">
      <li><a href="${appUrlUtils.fullLocation()}">Home</a></li>
      <li>Partitions</li>
    </ol>
    <div class="l-container">
      <div class='l-2col u-space-mb--large'>
        <div class="l-first">
          ${renderKeyTotalFactoid.call(this)}
        </div>
        <div class="l-second">
          ${renderAutoPathTotalFactoid.call(this)}
        </div>
      </div>
      <div ?hidden=${!this.autoPathRuleCt}>
        <h2>Auto Path Rules</h2>
        <caskfs-autopath-list type="partition"></caskfs-autopath-list>
      </div>
    </div>
  </div>
`;}

function renderKeyTotalFactoid(){
  return html`
    <div class="category-brand--rec-pool">
      <div class="factoid factoid--brackets">
        <div class="factoid__link">
          <div class="factoid__bracket-one"></div>
          <div class="factoid__bracket-wrapper">
            <div class="factoid__figure factoid__icon">
              <cork-icon icon="fas.layer-group"></cork-icon>
            </div>
            <div class="factoid__body">
              <h2 class="factoid__big-text">${this.partitionKeyCt}</h2>
              <h3 class="factoid__small-text no-wrap">Total Partition Keys</h3>
            </div>
          </div>
          <div class="factoid__bracket-two"></div>
        </div>
      </div>
    </div>
  `;
}

function renderAutoPathTotalFactoid(){
  return html`
    <div class="category-brand--redbud">
      <div class="factoid factoid--brackets">
        <div class="factoid__link">
          <div class="factoid__bracket-one"></div>
          <div class="factoid__bracket-wrapper">
            <div class="factoid__figure factoid__icon">
              <cork-icon icon="fas.crosshairs"></cork-icon>
            </div>
            <div class="factoid__body">
              <h2 class="factoid__big-text">${this.autoPathRuleCt}</h2>
              <h3 class="factoid__small-text no-wrap">Total Auto Path Rules</h3>
            </div>
          </div>
          <div class="factoid__bracket-two"></div>
        </div>
      </div>
    </div>
  `;
}