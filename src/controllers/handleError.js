import logger from '../client/logger.js';

function handleError(res, req, error, details) {
  logger.error('Error in request', {error, corkTraceId: req.corkTraceId});

  res.status(500).json({
    message : error.message,
    details : details,
    stack : error.stack
  });

}

export default handleError;
