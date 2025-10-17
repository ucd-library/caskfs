import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { preload } from '@ucd-lib/cork-icon';
import logger from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildIconsets(){

  const icons = [
    {
      name: 'fontawesome-7.0-solid', 
      aliases: ['fas'], 
      preload: [
        'caret-down', 'caret-up', 'check', 'file-circle-plus', 
        'folder-plus', 'plug-circle-exclamation', 
        'sort', 'turn-up', 'xmark', 'folder', 'file', 'trash',
        'spinner', 'circle-exclamation', 'upload', 'circle-info'
      ]
    }, 
    { name: 'ucdlib-core', 
      preload: ['ucdlib-logo']
    } 
  ];
  const scriptTag = preload(icons);
  const outFile = path.join(__dirname, '../html/icons.html.js');

  fs.writeFileSync(outFile, `export default String.raw\`${scriptTag}\`;`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  logger.info('Building icon sets...');
  buildIconsets();
  logger.info('Icon sets built');
}