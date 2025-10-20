# CaskFS Testing - Quick Reference

## 🚀 Quick Start

```bash
# 1. Start database
./devops/start-dev.sh

# 2. Initialize
./devops/cli.sh init-pg

# 3. Run tests
npm test
```

## 📝 Test Commands

```bash
# Run all tests
npm test
./test/run-tests.sh all

# Run specific test suite
npm run test:core              # Core functionality
npm run test:integration       # Integration tests
node --test test/rdf.test.js   # RDF tests

# Watch mode (auto-rerun on changes)
npm run test:watch
./test/run-tests.sh watch

# Verbose output
npm run test:verbose
./test/run-tests.sh verbose

# Clean test data
./test/run-tests.sh clean
```

## 🔧 Setup & Maintenance

```bash
# Initialize database
./test/run-tests.sh init
./devops/cli.sh init-pg

# Reset state (powerwash)
./test/run-tests.sh clean
./devops/cli.sh powerwash

# Check database connection
./test/run-tests.sh help
```

## 🌍 Environment Variables

```bash
# Essential
export CASKFS_ROOT_DIR=./cache
export CASKFS_ENABLE_POWERWASH=true

# Database
export CASKFS_PG_HOST=localhost
export CASKFS_PG_PORT=5432
export CASKFS_PG_DATABASE=caskfs_db
export CASKFS_PG_USER=postgres
export CASKFS_PG_PASSWORD=postgres

# Optional
export CASKFS_ACL_ENABLED=true
export CASKFS_ACL_DEFAULT_REQUESTOR=test-user
export CASKFS_LOG_LEVEL=warn
```

## 📦 Test Files

| File | Purpose | Lines |
|------|---------|-------|
| `caskfs.test.js` | Core functionality | 385 |
| `integration.test.js` | Integration scenarios | 550 |
| `rdf.test.js` | RDF & Linked Data | 530 |
| `helpers.js` | Test utilities | 200 |

## ✅ What's Tested

- ✅ File CRUD operations
- ✅ Partition keys & metadata
- ✅ Directory operations
- ✅ ACL & permissions
- ✅ Hash-based sync
- ✅ JSON-LD & RDF
- ✅ Transactions
- ✅ Error handling

## 🐛 Debugging

```bash
# Run single test file
node --test test/caskfs.test.js

# Run specific test by name
node --test --test-name-pattern="should write a file" test/caskfs.test.js

# Verbose output
node --test --test-reporter=spec test/caskfs.test.js

# Enable debug logs
export CASKFS_LOG_LEVEL=debug
npm test
```

## 🔍 Common Issues

### Database connection fails
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Start dev database
./devops/start-dev.sh
```

### Tests fail with "file exists"
```bash
# Run powerwash to clean state
./test/run-tests.sh clean
```

### Powerwash not working
```bash
# Ensure it's enabled
export CASKFS_ENABLE_POWERWASH=true
```

## 📚 Examples

### Write a file test
```javascript
it('should write a file', async () => {
  await caskfs.write({
    filePath: '/test/file.txt',
    data: Buffer.from('content'),
    requestor: 'test-user'
  });
  
  const exists = await caskfs.exists({ 
    filePath: '/test/file.txt' 
  });
  assert.strictEqual(exists, true);
});
```

### Using helpers
```javascript
import { cleanupFiles, createTestFiles } from './helpers.js';

// Create test files
const files = await createTestFiles(caskfs, {
  '/test/file1.txt': 'content 1',
  '/test/file2.txt': 'content 2'
});

// Cleanup after test
await cleanupFiles(caskfs, files);
```

## 🎯 Best Practices

1. **Clean up** - Always delete test files in `after` hooks
2. **Unique paths** - Use unique directories per test suite
3. **Test isolation** - Each test should be independent
4. **Use helpers** - Leverage utility functions
5. **Handle errors** - Test both success and failure cases
6. **Meaningful names** - Descriptive test descriptions
7. **Async/await** - Always await async operations

## 📊 CI/CD

Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Multiple Node.js versions (18.x, 20.x)

GitHub Actions workflow: `.github/workflows/test.yml`

## 🔗 Resources

- [Full Test README](./README.md)
- [Test Summary](./TESTING_SUMMARY.md)
- [CaskFS README](../README.md)
- [Documentation](../docs/)

---

**Need help?** Check `./test/run-tests.sh help` or read the full documentation in `test/README.md`
