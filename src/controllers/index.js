import { Router } from 'express';
import dir from './dir.js';
import fs from './fs.js';
import rel from './rel.js';
import ld from './ld.js';
import find from './find.js';
import system from './system.js';

const router = Router();

router.use('/dir', dir);
router.use('/fs', fs);
router.use('/rel', rel);
router.use('/find', find);
router.use('/ld', ld);
router.use('/system', system);

export default router;
