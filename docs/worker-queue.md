# Worker Queue System

A flexible Node.js worker queue system for offloading CPU-intensive operations to worker threads.

## Features

- **Multiple Worker Types**: Support for different worker types (ld-parser, hash, etc.)
- **Parallel Processing**: Configurable number of workers per type
- **Promise-based API**: Simple async/await interface
- **Queue Management**: Automatic queuing when all workers are busy
- **Statistics**: Track completed, failed, and queued tasks

## Architecture

```
WorkerManager (Singleton)
    └── WorkerQueue
            ├── Worker Type: ld-parser
            │   ├── Worker 1
            │   ├── Worker 2
            │   └── Worker N
            └── Worker Type: hash
                ├── Worker 1
                ├── Worker 2
                └── Worker N
```

## Usage

### Basic Usage

```javascript
import workerManager from './lib/worker-manager.js';

// Initialize the worker queue
workerManager.initialize({ maxWorkers: 4 });

// Parse linked data
const file = { /* file metadata */ };
const result = await workerManager.parseLinkedData(file);

// Calculate file hash
const hashes = await workerManager.calculateFileHash('/path/to/file', ['sha256', 'md5']);

// Shutdown when done
await workerManager.shutdown();
```

### Advanced Usage

```javascript
// Get the queue instance directly
const queue = workerManager.get();

// Execute custom worker method
const result = await queue.execute('ld-parser', 'parseLinkedData', { file });

// Check queue statistics
const stats = workerManager.getStats();
console.log(stats);
// {
//   tasksCompleted: 100,
//   tasksFailed: 2,
//   tasksQueued: 5,
//   queueSizes: { 'ld-parser': 3, 'hash': 2 },
//   workerCounts: {
//     'ld-parser': { total: 4, available: 2, busy: 2 },
//     'hash': { total: 4, available: 3, busy: 1 }
//   },
//   pendingTasks: 5
// }
```

### Parallel Processing

```javascript
// Process multiple files in parallel
const files = [file1, file2, file3, file4, file5];
const promises = files.map(f => workerManager.parseLinkedData(f));
const results = await Promise.all(promises);
```

## Worker Types

### ld-parser

Parses linked data from RDF files using the `parseLinkedData()` method from `ld.js`.

**Methods:**
- `parseLinkedData(file)` - Parse linked data from a file object

**Input:**
```javascript
{
  file: {
    filepath: '/path/to/file.jsonld.json',
    filename: 'file.jsonld.json',
    fullpath: '/full/path/to/file.jsonld.json',
    digests: { sha256: '...', md5: '...' },
    size: 1024,
    created: Date,
    modified: Date,
    metadata: { resourceType: 'rdf', mimeType: 'application/ld+json' }
  }
}
```

**Output:**
```javascript
{
  filters: { graph: [...], subject: [...], predicate: [...], object: [...] },
  linkMap: [...],
  literals: [...],
  types: [...],
  fileQuads: [...],
  caskQuads: [...]
}
```

### hash

Calculates cryptographic hashes for files.

**Methods:**
- `calculateHash(filePath, algorithms)` - Calculate hash(es) for a file

**Input:**
```javascript
{
  filePath: '/path/to/file',
  algorithms: ['sha256', 'md5'] // or single string 'sha256'
}
```

**Output:**
```javascript
{
  sha256: '...',
  md5: '...'
}
```

## Adding New Worker Types

1. Create a new worker script in `src/lib/workers/`:

```javascript
// src/lib/workers/my-worker.js
import { parentPort } from 'worker_threads';

parentPort.on('message', async (message) => {
  const { taskId, method, data } = message;
  
  try {
    let result;
    
    switch (method) {
      case 'myMethod':
        result = await doWork(data);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    parentPort.postMessage({ taskId, result });
  } catch (error) {
    parentPort.postMessage({ 
      taskId, 
      error: error.message, 
      stack: error.stack 
    });
  }
});
```

2. Register the worker type in `worker-manager.js`:

```javascript
workerTypes: {
  'my-worker': {
    scriptPath: path.join(__dirname, 'workers', 'my-worker.js'),
    workerData: { /* initial config */ }
  }
}
```

3. Add a convenience method (optional):

```javascript
async myWorkerMethod(data) {
  const queue = this.get();
  return queue.execute('my-worker', 'myMethod', data);
}
```

## Configuration

The worker queue can be configured through the `config.js` file or initialization options:

```javascript
workerManager.initialize({
  maxWorkers: 4,  // Maximum workers per type
  dbType: 'postgres',  // Database type for workers
  // ... other options
});
```

## Error Handling

Workers automatically handle errors and reject promises:

```javascript
try {
  const result = await workerManager.parseLinkedData(file);
} catch (error) {
  console.error('Worker error:', error.message);
}
```

## Shutdown

Always shutdown the worker queue when your application exits:

```javascript
process.on('SIGINT', async () => {
  await workerManager.shutdown();
  process.exit(0);
});
```

## Performance Considerations

1. **Worker Count**: Set `maxWorkers` based on CPU cores and task complexity
2. **Task Size**: Break large tasks into smaller chunks for better parallelization
3. **Memory**: Each worker has its own memory space; monitor usage for memory-intensive tasks
4. **Queue Size**: Monitor queue sizes to detect bottlenecks

## Example Integration

Here's how to integrate the worker queue into the existing `ld.js` insert method:

```javascript
// In ld.js insert method
import workerManager from './worker-manager.js';

async insert(fileId, opts={}) {
  // ... existing code ...
  
  // Use worker instead of direct call
  let { filters, linkMap, literals, types, fileQuads, caskQuads } = 
    await workerManager.parseLinkedData(file);
  
  // ... rest of insert logic ...
}
```
