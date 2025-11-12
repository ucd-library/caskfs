// all global styles should be imported here
import sharedStyles from '@ucd-lib/theme-sass/style-ucdlib.css';
import brandCssProps from '@ucd-lib/theme-sass/css-properties.css';
import fonts from './fonts.css';
import headings from './headings.css';

// mainDomElement styles from lit component elements
// if done in the element itself, it creates a style tag for each instance
import { styles as directoryListStyles } from '../elements/components/caskfs-directory-list.tpl.js';
import { styles as uploadFormStyles } from '../elements/components/caskfs-upload-form.tpl.js';
import { styles as deleteFormStyles } from '../elements/components/caskfs-delete-form.tpl.js';
import { styles as sortFormStyles } from '../elements/components/caskf-sort-form.tpl.js';
import { styles as systemStatsStyles } from '../elements/components/caskf-system-stats.tpl.js';
import { styles as fileSearchResultsStyles } from '../elements/components/caskfs-file-search-results.tpl.js';

function getLitStyles(styles){
  return styles().map(s => s.cssText).join('\n');
}

const styles = `
  [hidden] {
    display: none !important;
  }
  .bold {
    font-weight: 700;
  }
  .small {
    font-size: .875rem;
  }
  .no-wrap {
    white-space: nowrap;
  }
  .no-contents {
    display: flex;
    align-items: center;
    gap: .5rem;
    padding: 2rem 0;
  }
  .factoid cork-icon {
    --cork-icon-size: 2em;
  }

  ${sharedStyles}
  ${brandCssProps}
  ${fonts}
  ${headings}
  ${getLitStyles(directoryListStyles)}
  ${getLitStyles(uploadFormStyles)}
  ${getLitStyles(deleteFormStyles)}
  ${getLitStyles(sortFormStyles)}
  ${getLitStyles(systemStatsStyles)}
  ${getLitStyles(fileSearchResultsStyles)}
`;

let sharedStyleElement = document.createElement('style');
sharedStyleElement.innerHTML = styles;
document.head.appendChild(sharedStyleElement);
