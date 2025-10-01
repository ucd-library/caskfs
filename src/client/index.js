import express from 'express';
import config from '../lib/config.js';
import apiRoutes from '../controllers/index.js';
import staticRoutes from './controllers/static.js';
import logger from './logger.js';

const app = express();

app.use(express.json());

app.use('/api', apiRoutes);
staticRoutes(app);

function startServer(opts={}) {
  const port = opts.port || config.webapp.port;
  app.listen(port, () => {
    logger.info(`CaskFs web application running on port ${port}`);
  });
}

export { app, startServer };

// Start the server if this file is run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startServer();
}
