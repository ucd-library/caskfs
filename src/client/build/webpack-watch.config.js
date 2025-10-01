import corkAppBuild from '@ucd-lib/cork-app-build';
import webpackUtils from './webpack-utils.js';

webpackUtils.removeJsDir(false);

let configs = corkAppBuild.watch({
  root : webpackUtils.root,
  entry : webpackUtils.entry,
  preview : webpackUtils.jsDir(false),
  modern : webpackUtils.bundleName,
  clientModules : webpackUtils.clientModules
});

if( !Array.isArray(configs) ) configs = [configs];

configs.forEach((config, index) => {
  webpackUtils.addCssLoader(config);
});

export default configs;
