/**
 * Example usage of the WorkerQueue system
 * 
 * This demonstrates how to use the worker queue for parsing linked data
 * and calculating file hashes in parallel using worker threads.
 */

import workerManager from './worker-manager.js';

async function exampleUsage() {
  console.log('Initializing worker queue...');
  
  // Initialize the worker queue with 4 workers per type
  workerManager.initialize({ maxWorkers: 4 });
  
  try {
    // Example 1: Parse linked data
    console.log('\nExample 1: Parsing linked data...');
    const file = {
      filepath: '/example/test.jsonld.json',
      filename: 'test.jsonld.json',
      fullpath: '/full/path/to/test.jsonld.json',
      digests: {
        sha256: 'abc123',
        md5: 'def456'
      },
      size: 1024,
      created: new Date(),
      modified: new Date(),
      metadata: {
        resourceType: 'rdf',
        mimeType: 'application/ld+json'
      }
    };
    
    const ldResult = await workerManager.parseLinkedData(file);
    console.log('Linked data parsed successfully!');
    console.log('Filters:', Object.keys(ldResult.filters));
    console.log('Types:', ldResult.types);
    console.log('Literals count:', ldResult.literals.length);
    
    // Example 2: Calculate file hash
    console.log('\nExample 2: Calculating file hash...');
    const hashResult = await workerManager.calculateFileHash(
      '/path/to/file.txt',
      ['sha256', 'md5']
    );
    console.log('Hash calculated successfully!');
    console.log('Hashes:', hashResult);
    
    // Example 3: Multiple parallel tasks
    console.log('\nExample 3: Processing multiple files in parallel...');
    const files = [
      { filepath: '/file1.jsonld.json', /* ... other properties */ },
      { filepath: '/file2.jsonld.json', /* ... other properties */ },
      { filepath: '/file3.jsonld.json', /* ... other properties */ }
    ];
    
    const promises = files.map(f => workerManager.parseLinkedData(f));
    const results = await Promise.all(promises);
    console.log(`Processed ${results.length} files in parallel!`);
    
    // Example 4: Check queue stats
    console.log('\nExample 4: Queue statistics...');
    const stats = workerManager.getStats();
    console.log('Stats:', JSON.stringify(stats, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Shutdown the worker queue
    console.log('\nShutting down worker queue...');
    await workerManager.shutdown();
    console.log('Done!');
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch(console.error);
}

export default exampleUsage;
