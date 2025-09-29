import { Router } from 'express';
import dir from './dir.js';
import fs from './fs.js';
import rel from './rel.js';
import rdf from './rdf.js';
import find from './find.js';

const router = Router();

router.use('/dir', dir);
router.use('/fs', fs);
router.use('/rel', rel);
router.use('/find', find);
router.use('/rdf', rdf);

export default router;
