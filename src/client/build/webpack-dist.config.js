import corkAppBuild from '@ucd-lib/cork-app-build';
import webpackUtils from './webpack-utils.js';

webpackUtils.removeJsDir(true);

let config = corkAppBuild.dist({
  root : webpackUtils.root,
  entry : webpackUtils.entry,
  dist: webpackUtils.jsDir(true),
  modern : webpackUtils.bundleName,
  ie: `${webpackUtils.bundleName.split(".")[0]}-ie.js`,
  clientModules : webpackUtils.clientModules
});

if( !Array.isArray(config) ) config = [config];

config.forEach(conf => {
  webpackUtils.addCssLoader(conf);
});


export default config;
