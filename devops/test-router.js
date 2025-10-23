import express from 'express';
import { caskRouter } from '../src/client/index.js';

const app = express();
const router = caskRouter({ logRequests: true });
const basepath = '/cask';

app.use(basepath, router);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test CaskFS router running on http://localhost:${PORT}${basepath}`);
});