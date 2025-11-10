import logger from '../client/logger.js';
import { MissingResourceError, AclAccessError } from '../lib/errors.js';
import { ApiValidationError } from './validate.js';

function handleError(res, req, error, details) {
  logger.error('Error in request', {error, corkTraceId: req.corkTraceId});

  if ( error instanceof MissingResourceError ) {
    return res.status(404).json({ error: error.message });
  }
  if ( error instanceof AclAccessError ) {
    return res.status(403).json({ 
      error: error.message, 
      details: { 
        user: error.user, 
        filePath: error.filePath,
        permission: error.permission
      } 
    });
  }
  if ( error instanceof ApiValidationError ) {
    return res.status(400).json({ 
      error: error.message,
      details: {
        errors: error.errors
      }
    });
  }

  res.status(500).json({
    message : error.message,
    details : details,
    stack : error.stack
  });

}

export default handleError;
