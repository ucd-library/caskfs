import { Router } from 'express';
import handleError from './handleError.js';
import caskFs from './caskFs.js';
import { Validator } from './validate.js';

const router = Router();

const parseArgs = ( query ) => {
  const validator = new Validator({
    type: {
      type: 'string',
      required: true,
      inSet: ['bucket', 'partition']
    }
  });

  const parsed = validator.validate(query);
  return parsed;
};

router.get('/:type', async (req, res) => {
  try {
    const options = parseArgs({
      type: req.params.type
    });
    const resp = await caskFs.autoPath[options.type].getConfig(true);
    res.status(200).json(resp.map( r => {
      r.filter_regex = r.filter_regex ? r.filter_regex.toString() : null;
      return r;
    }));
  } catch (e) {
    return handleError(res, req, e);
  }
});

export default router;