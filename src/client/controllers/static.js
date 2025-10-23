import path from 'path';
import spaMiddleware from '@ucd-lib/spa-router-middleware';
import { fileURLToPath } from 'url';
import loaderHtml from '../html/loader.html.js';
import preloadedIcons from '../html/icons.html.js';
import logger from '../logger.js';
import config from '../../lib/config.js';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (app) => {
  let assetsDir = path.join(__dirname, '../public');
  logger.info(`Serving static assets from ${assetsDir}`);

  let packageJsonPath = path.join(__dirname, '../../../package.json');
  let bundleVersion = 'unknown';
  try {
    let packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (packageJson && packageJson.version) {
      bundleVersion = packageJson.version;
    }
  } catch (e) {
    logger.warn(`Unable to read version from package.json: ${e.message}`);
  }

  const routes = ['directory', 'file-search', 'config', 'file', 'rel'];
  const appTitle = 'CaskFs';

  spaMiddleware({
    app,
    htmlFile : path.join(__dirname, '../html/index.html'),
    isRoot : true,
    appRoutes : routes,
    static : {
      dir : assetsDir
    },
    enable404 : false,

    getConfig : async (req, res, next) => {
      const basePath = req.caskBasePath === '/' ? '' : req.caskBasePath;
      next({
        routes,
        title: appTitle,
        basePath
      });
    },

    template : (req, res, next) => {
      console.log('cask base path:', req.caskBasePath);
      const basepath = req.caskBasePath === '/' ? '' : req.caskBasePath;
      const bundle = config.webapp.isDevEnv ? 
        `<script src='${basepath}/js/dev/${config.webapp.bundleName}?v=${(new Date()).toISOString()}'></script>` : 
        `<script src='${basepath}/js/dist/${config.webapp.bundleName}?v=${bundleVersion}'></script>`;
      const siteIcon = `<link rel="icon" href="${basepath}/img/site-icon.png">`;
      next({
        title: appTitle,
        bundle,
        loaderHtml,
        preloadedIcons,
        siteIcon
      });
    }
  });
};
