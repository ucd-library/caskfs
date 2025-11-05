import { parentPort, workerData } from 'worker_threads';
import Rdf from '../ld.js';

// Initialize RDF instance for this worker
const rdf = new Rdf({
  noClient: true
});

// Listen for messages from the parent thread
parentPort.on('message', async (message) => {
  const { taskId, method, data } = message;
  
  try {
    let result;
    
    switch (method) {
      case 'parseLinkedData':
        result = await rdf.parseLinkedData(data.file);
        
        // Convert Sets to Arrays for serialization
        if (result.filters) {
          for (const key of Object.keys(result.filters)) {
            if (result.filters[key] instanceof Set) {
              result.filters[key] = Array.from(result.filters[key]);
            }
          }
        }
        
        if (result.linkMap instanceof Map) {
          result.linkMap = Array.from(result.linkMap.values());
        }
        
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
