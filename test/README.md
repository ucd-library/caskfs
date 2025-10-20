# CaskFS Test Suite

This directory contains comprehensive tests for the CaskFS library.

## Prerequisites

Before running tests, ensure you have:

1. PostgreSQL database running and accessible
2. Database initialized with CaskFS schema
3. Environment variables configured (see below)

## Environment Setup

### Required Environment Variables

```bash
# Database Configuration
export CASKFS_PG_HOST=localhost
export CASKFS_PG_PORT=5432
export CASKFS_PG_USER=postgres
export CASKFS_PG_PASSWORD=postgres
export CASKFS_PG_DATABASE=caskfs_test

# CaskFS Configuration
export CASKFS_ROOT_DIR=/tmp/caskfs-test
export CASKFS_ENABLE_POWERWASH=true

# Optional: ACL Configuration
export CASKFS_ACL_ENABLED=true
export CASKFS_ACL_DEFAULT_REQUESTOR=test-user
```

### Using devops scripts

The easiest way to run tests is using the devops CLI script:

```bash
# Start dev database
./devops/start-dev.sh

# Initialize database
./devops/cli.sh init-pg

# Run tests
npm test
```

## Test Files

- **`caskfs.test.js`** - Core functionality tests
  - File operations (write, read, delete)
  - Partition keys and metadata
  - Directory listing
  - Sync operations
  - ACL and permissions
  - Transactions
  - Context management

- **`integration.test.js`** - Integration and real-world workflow tests
  - Complete file lifecycle
  - JSON-LD and RDF handling
  - Hash-based operations
  - Soft delete functionality
  - Access control integration
  - Batch operations
  - Error handling

- **`helpers.js`** - Test utility functions
  - Test environment setup
  - File cleanup utilities
  - Test user management
  - Content generation
  - Assertion helpers

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
node --test test/caskfs.test.js
```

### Run with verbose output
```bash
node --test --test-reporter=spec test/caskfs.test.js
```

### Run specific test suite
```bash
node --test --test-name-pattern="File Operations" test/caskfs.test.js
```

## Test Structure

Tests are organized using Node.js built-in test runner with the following structure:

```javascript
describe('Feature Category', () => {
  let caskfs;

  before(async () => {
    // Setup before all tests
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
  });

  after(async () => {
    // Cleanup after all tests
    await caskfs.dbClient.end();
  });

  beforeEach(async () => {
    // Setup before each test
    // Clean up test files
  });

  it('should perform specific operation', async () => {
    // Test implementation
    assert.ok(result);
  });
});
```

## Powerwash for Clean State

Tests can use the `powerwash` command to reset the database and file system to a clean state:

```bash
./devops/cli.sh powerwash
```

**WARNING**: This will delete ALL data and metadata!

In tests, you can use the helper function:

```javascript
import { runPowerwash } from './helpers.js';

beforeEach(async () => {
  await runPowerwash(caskfs);
});
```

## Test Coverage

The test suite covers:

### Core Functionality
- ✅ File write operations (Buffer, Stream, File path, Hash reference)
- ✅ File read operations
- ✅ File existence checks
- ✅ File metadata retrieval
- ✅ File deletion (hard and soft delete)
- ✅ File replacement
- ✅ Directory listing

### Partition Keys & Metadata
- ✅ Writing files with partition keys
- ✅ Patching metadata
- ✅ Custom metadata fields

### Access Control (ACL)
- ✅ User management
- ✅ Role management
- ✅ User-role assignments
- ✅ Directory permissions
- ✅ Public/private directory settings
- ✅ ACL hierarchy and inheritance

### Advanced Features
- ✅ Hash-based file sync
- ✅ Optimistic writes with existing hashes
- ✅ Soft delete operations
- ✅ JSON-LD file handling
- ✅ RDF relationships
- ✅ Auto-path values
- ✅ CAS location resolution

### Database Operations
- ✅ Transactions
- ✅ Transaction rollback on error
- ✅ Statistics and monitoring

### Error Handling
- ✅ Non-existent file errors
- ✅ Invalid file path errors
- ✅ Missing parameter errors
- ✅ Duplicate file errors

## Writing New Tests

### Example Test

```javascript
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import CaskFs from '../src/index.js';
import { cleanupFiles } from './helpers.js';

describe('My New Feature', () => {
  let caskfs;
  const testFiles = ['/test/myfile.txt'];

  before(async () => {
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
  });

  after(async () => {
    await cleanupFiles(caskfs, testFiles);
    await caskfs.dbClient.end();
  });

  it('should do something amazing', async () => {
    // Your test here
    await caskfs.write({
      filePath: testFiles[0],
      data: Buffer.from('test'),
      requestor: 'test-user'
    });

    const exists = await caskfs.exists({ filePath: testFiles[0] });
    assert.strictEqual(exists, true);
  });
});
```

## Best Practices

1. **Clean up after tests**: Always delete test files in `after` or `afterEach` hooks
2. **Use unique paths**: Use unique directory/file paths for each test suite to avoid conflicts
3. **Test isolation**: Each test should be independent and not rely on other tests
4. **Use helpers**: Leverage helper functions from `helpers.js` for common operations
5. **Handle async properly**: Always `await` async operations
6. **Meaningful assertions**: Use descriptive assertion messages
7. **Error testing**: Test both success and failure cases

## Troubleshooting

### Database connection errors
- Ensure PostgreSQL is running
- Check connection credentials in environment variables
- Verify database exists and is initialized

### File system errors
- Ensure `CASKFS_ROOT_DIR` exists and is writable
- Check disk space availability

### Powerwash not working
- Verify `CASKFS_ENABLE_POWERWASH=true` is set
- Not available for cloud storage backends

### Tests hanging
- Check for unclosed database connections
- Ensure all async operations are awaited
- Look for infinite loops in test code

## CI/CD Integration

To run tests in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Setup PostgreSQL
  run: |
    docker run -d -p 5432:5432 \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=caskfs_test \
      postgres:14

- name: Initialize CaskFS
  run: |
    export CASKFS_ENABLE_POWERWASH=true
    npm run init-db

- name: Run tests
  run: npm test
```

## Contributing

When adding new features to CaskFS:

1. Write tests for the new functionality
2. Ensure all existing tests still pass
3. Add documentation for new test scenarios
4. Update this README if adding new test files

## Questions?

See the main [CaskFS README](../README.md) or check the [documentation](../docs/).
