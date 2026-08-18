import { Router } from 'express';
import acl from './acl.js';
import autoPath from './auto-path.js';
import dir from './dir.js';
import fs from './fs.js';
import rel from './rel.js';
import ld from './ld.js';
import find from './find.js';
import system from './system.js';
import transfer from './transfer.js';
import lineage from './lineage.js';

const router = Router();

router.use('/acl', acl);
router.use('/auto-path', autoPath);
router.use('/dir', dir);
router.use('/fs', fs);
router.use('/rel', rel);
router.use('/find', find);
router.use('/ld', ld);
router.use('/system', system);
router.use('/transfer', transfer);
router.use('/lineage', lineage);

export default router;
