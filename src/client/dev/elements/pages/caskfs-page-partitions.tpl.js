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
      <p ?hidden=${!!this.autoPathRuleCt}>No partition rules have been defined.</p>
      <caskfs-autopath-list type="partition"></caskfs-autopath-list>
    </div>
  </div>
`;}
