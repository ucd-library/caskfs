// all global styles should be imported here
import sharedStyles from '@ucd-lib/theme-sass/style-ucdlib.css';
import brandCssProps from '@ucd-lib/theme-sass/css-properties.css';
import fonts from './fonts.css';
import headings from './headings.css';

// mainDomElement styles from lit component elements
// if done in the element itself, it creates a style tag for each instance

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

  ${sharedStyles}
  ${brandCssProps}
  ${fonts}
  ${headings}
`;

let sharedStyleElement = document.createElement('style');
sharedStyleElement.innerHTML = styles;
document.head.appendChild(sharedStyleElement);
