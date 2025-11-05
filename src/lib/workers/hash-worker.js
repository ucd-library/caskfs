import { parentPort, workerData } from 'worker_threads';
import crypto from 'crypto';
import fs from 'fs';

/**
 * Calculate hash for a file
 * @param {String} filePath - Path to the file
 * @param {String|Array} algorithms - Hash algorithm(s) to use (e.g., 'sha256', 'md5', ['sha256', 'md5'])
 * @returns {Object} Object with hash values
 */
async function calculateFileHash(filePath, algorithms) {
  if (!Array.isArray(algorithms)) {
    algorithms = [algorithms];
  }
  
  const hashes = {};
  const hashers = {};
  
  // Create hash instances for each algorithm
  for (const algo of algorithms) {
    hashers[algo] = crypto.createHash(algo);
  }
  
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (chunk) => {
      for (const algo of algorithms) {
        hashers[algo].update(chunk);
      }
    });
    
    stream.on('end', () => {
      for (const algo of algorithms) {
        hashes[algo] = hashers[algo].digest('hex');
      }
      resolve(hashes);
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
}

// Listen for messages from the parent thread
parentPort.on('message', async (message) => {
  const { taskId, method, data } = message;
  
  try {
    let result;
    
    switch (method) {
      case 'calculateHash':
        result = await calculateFileHash(data.filePath, data.algorithms || ['sha256', 'md5']);
        break;
        
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    // Send result back to parent
    parentPort.postMessage({
      taskId,
      result
    });
  } catch (error) {
    // Send error back to parent
    parentPort.postMessage({
      taskId,
      error: error.message,
      stack: error.stack
    });
  }
});
