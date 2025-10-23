import logger from '../client/logger.js';
import { MissingResourceError, AclAccessError } from '../lib/errors.js';

// simple error to represent validation issues with api inputs
// probably should be reengineered to be more robust in the future
export class ApiValidationError extends Error {
  constructor(field, expectedFmt, value) {
    super(`Validation error on ${field}: expected ${expectedFmt}`);
    this.name = 'ApiValidationError';
    this.field = field;
    this.expectedFmt = expectedFmt;
    this.value = value;
  }
}

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
        field: error.field,
        value: error.value
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
