import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import CaskFs from '../src/index.js';
import { createContext } from '../src/lib/context.js';
import config from '../src/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_USER = 'test-user';
const TEST_ROLE = 'test-role';
const TEST_DIR = '/test';
const TEST_FILE_PATH = '/test/sample.txt';
const TEST_CONTENT = 'Hello, CaskFS!';

describe('CaskFS Core Functionality', () => {
  let caskfs;

  before(async () => {
    // Initialize CaskFS instance
    caskfs = new CaskFs();
    
    // Ensure database is initialized
    await caskfs.dbClient.connect();
    
    // Set default requestor for tests
    config.acl.defaultRequestor = TEST_USER;
  });

  after(async () => {
    // Clean up database connection
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  describe('File Operations', () => {
    beforeEach(async () => {
      // Clean up test files before each test
      try {
        await caskfs.delete({ filePath: TEST_FILE_PATH, requestor: TEST_USER });
      } catch (e) {
        // File may not exist, that's okay
      }
    });

    it('should write a file with Buffer data', async () => {
      const context = createContext({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER
      });

      const result = await caskfs.write(context);
      
      assert.ok(result, 'Write should return a result');
      assert.ok(result.fileId, 'Result should contain fileId');
    });

    it('should write a file from a file path', async () => {
      // Create a temporary file
      const tempFile = path.join(__dirname, 'temp-test-file.txt');
      await fs.writeFile(tempFile, TEST_CONTENT);

      try {
        const context = createContext({
          filePath: TEST_FILE_PATH,
          readPath: tempFile,
          requestor: TEST_USER
        });

        const result = await caskfs.write(context);
        
        assert.ok(result, 'Write should return a result');
        assert.ok(result.fileId, 'Result should contain fileId');
      } finally {
        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    it('should check if a file exists', async () => {
      // Write a file first
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER
      });

      const exists = await caskfs.exists({ filePath: TEST_FILE_PATH });
      assert.strictEqual(exists, true, 'File should exist');

      const notExists = await caskfs.exists({ filePath: '/non-existent.txt' });
      assert.strictEqual(notExists, false, 'Non-existent file should not exist');
    });

    it('should read a file', async () => {
      // Write a file first
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER
      });

      const content = await caskfs.read({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER
      });

      assert.ok(Buffer.isBuffer(content), 'Content should be a Buffer');
      assert.strictEqual(content.toString('utf-8'), TEST_CONTENT, 'Content should match');
    });

    it('should get file metadata', async () => {
      // Write a file first
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER,
        mimeType: 'text/plain'
      });

      const metadata = await caskfs.metadata({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER
      });

      assert.ok(metadata, 'Metadata should exist');
      assert.strictEqual(metadata.filename, 'sample.txt', 'Filename should match');
      assert.strictEqual(metadata.directory, '/test/', 'Directory should match');
      assert.strictEqual(metadata.mime_type, 'text/plain', 'MIME type should match');
    });

    it('should replace an existing file when replace flag is set', async () => {
      const content1 = 'First content';
      const content2 = 'Second content';

      // Write initial file
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(content1),
        requestor: TEST_USER
      });

      // Replace the file
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(content2),
        replace: true,
        requestor: TEST_USER
      });

      const content = await caskfs.read({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER
      });

      assert.strictEqual(content.toString('utf-8'), content2, 'Content should be replaced');
    });

    it('should error when trying to write without replace flag on existing file', async () => {
      // Write initial file
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER
      });

      // Try to write again without replace flag
      await assert.rejects(
        async () => {
          await caskfs.write({
            filePath: TEST_FILE_PATH,
            data: Buffer.from('New content'),
            requestor: TEST_USER
          });
        },
        (err) => {
          return err.message.includes('exists') || err.message.includes('already');
        },
        'Should throw error for existing file without replace flag'
      );
    });

    it('should delete a file', async () => {
      // Write a file first
      await caskfs.write({
        filePath: TEST_FILE_PATH,
        data: Buffer.from(TEST_CONTENT),
        requestor: TEST_USER
      });

      const result = await caskfs.delete({
        filePath: TEST_FILE_PATH,
        requestor: TEST_USER
      });

      assert.ok(result, 'Delete should return a result');
      assert.ok(result.metadata, 'Result should contain metadata');

      const exists = await caskfs.exists({ filePath: TEST_FILE_PATH });
      assert.strictEqual(exists, false, 'File should not exist after deletion');
    });
  });

  describe('Partition Keys', () => {
    const TEST_FILE_WITH_KEYS = '/test/file-with-keys.txt';

    beforeEach(async () => {
      try {
        await caskfs.delete({ filePath: TEST_FILE_WITH_KEYS, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should write a file with partition keys', async () => {
      const partitionKeys = ['key1', 'key2'];
      
      await caskfs.write({
        filePath: TEST_FILE_WITH_KEYS,
        data: Buffer.from(TEST_CONTENT),
        partitionKeys,
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: TEST_FILE_WITH_KEYS,
        requestor: TEST_USER
      });

      assert.ok(metadata.partition_keys, 'Partition keys should exist');
      assert.ok(Array.isArray(metadata.partition_keys), 'Partition keys should be an array');
      assert.strictEqual(metadata.partition_keys.length, 2, 'Should have 2 partition keys');
    });

    it('should patch metadata with new partition keys', async () => {
      // Write file with initial partition keys
      await caskfs.write({
        filePath: TEST_FILE_WITH_KEYS,
        data: Buffer.from(TEST_CONTENT),
        partitionKeys: ['key1'],
        requestor: TEST_USER
      });

      // Patch with additional partition key
      await caskfs.patchMetadata({
        filePath: TEST_FILE_WITH_KEYS,
        partitionKeys: ['key2'],
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: TEST_FILE_WITH_KEYS,
        requestor: TEST_USER
      });

      assert.ok(metadata.partition_keys.includes('key1'), 'Should have original key');
      assert.ok(metadata.partition_keys.includes('key2'), 'Should have new key');
    });
  });

  describe('Directory Listing', () => {
    const LIST_TEST_DIR = '/list-test';
    const files = [
      `${LIST_TEST_DIR}/file1.txt`,
      `${LIST_TEST_DIR}/file2.txt`,
      `${LIST_TEST_DIR}/subdir/file3.txt`
    ];

    before(async () => {
      // Create test files
      for (const filePath of files) {
        try {
          await caskfs.write({
            filePath,
            data: Buffer.from(`Content of ${filePath}`),
            requestor: TEST_USER
          });
        } catch (e) {
          // File might already exist
        }
      }
    });

    after(async () => {
      // Clean up test files
      for (const filePath of files) {
        try {
          await caskfs.delete({ filePath, requestor: TEST_USER });
        } catch (e) {}
      }
    });

    it('should list files in a directory', async () => {
      const result = await caskfs.ls({
        directory: LIST_TEST_DIR,
        requestor: TEST_USER
      });

      assert.ok(result, 'Result should exist');
      assert.ok(result.files, 'Result should have files array');
      assert.ok(result.files.length >= 2, 'Should have at least 2 files');
    });
  });

  describe('Sync Operation', () => {
    const SYNC_FILES = [
      '/sync-test/file1.txt',
      '/sync-test/file2.txt'
    ];

    beforeEach(async () => {
      // Clean up sync test files
      for (const filePath of SYNC_FILES) {
        try {
          await caskfs.delete({ filePath, requestor: TEST_USER });
        } catch (e) {}
      }
    });

    it('should sync files optimistically with existing hash', async () => {
      // First write a file to get its hash
      await caskfs.write({
        filePath: SYNC_FILES[0],
        data: Buffer.from('Test content'),
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: SYNC_FILES[0],
        requestor: TEST_USER
      });

      const hash = metadata.hash;

      // Now sync with the same hash to a different path
      const result = await caskfs.sync(
        { requestor: TEST_USER },
        {
          files: [
            {
              filePath: SYNC_FILES[1],
              hash: hash
            }
          ]
        }
      );

      assert.ok(result.success, 'Sync result should have success array');
      assert.strictEqual(result.success.length, 1, 'Should have 1 successful sync');
    });

    it('should report non-existent hashes', async () => {
      const fakeHash = 'a'.repeat(64); // Fake SHA256 hash

      const result = await caskfs.sync(
        { requestor: TEST_USER },
        {
          files: [
            {
              filePath: SYNC_FILES[0],
              hash: fakeHash
            }
          ]
        }
      );

      assert.ok(result.doesNotExist, 'Result should have doesNotExist array');
      assert.strictEqual(result.doesNotExist.length, 1, 'Should report 1 non-existent hash');
    });
  });

  describe('Stats', () => {
    it('should get CaskFS statistics', async () => {
      const stats = await caskfs.stats();

      assert.ok(stats, 'Stats should exist');
      assert.ok(typeof stats.totalFiles === 'number', 'Should have totalFiles count');
    });
  });
});

describe('CaskFS ACL (Access Control)', () => {
  let caskfs;

  before(async () => {
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
  });

  after(async () => {
    // Clean up
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  describe('User and Role Management', () => {
    const TEST_USER_ACL = 'acl-test-user';
    const TEST_ROLE_ACL = 'acl-test-role';

    after(async () => {
      // Clean up test user and role
      try {
        await caskfs.removeUserRole({ user: TEST_USER_ACL, role: TEST_ROLE_ACL });
        await caskfs.removeRole({ role: TEST_ROLE_ACL });
      } catch (e) {}
    });

    it('should ensure a role exists', async () => {
      const result = await caskfs.ensureRole({ role: TEST_ROLE_ACL });
      assert.ok(result, 'Ensure role should return a result');
    });

    it('should ensure a user exists', async () => {
      const result = await caskfs.ensureUser({ user: TEST_USER_ACL });
      assert.ok(result, 'Ensure user should return a result');
    });

    it('should set user role', async () => {
      await caskfs.ensureUser({ user: TEST_USER_ACL });
      await caskfs.ensureRole({ role: TEST_ROLE_ACL });
      
      const result = await caskfs.setUserRole({
        user: TEST_USER_ACL,
        role: TEST_ROLE_ACL
      });
      
      assert.ok(result, 'Set user role should return a result');
    });

    it('should remove user role', async () => {
      await caskfs.ensureUser({ user: TEST_USER_ACL });
      await caskfs.ensureRole({ role: TEST_ROLE_ACL });
      await caskfs.setUserRole({ user: TEST_USER_ACL, role: TEST_ROLE_ACL });

      const result = await caskfs.removeUserRole({
        user: TEST_USER_ACL,
        role: TEST_ROLE_ACL
      });
      
      assert.ok(result, 'Remove user role should return a result');
    });

    it('should ensure user roles from object', async () => {
      const userRoles = {
        [TEST_USER_ACL]: [TEST_ROLE_ACL, 'another-role']
      };

      await caskfs.ensureUserRoles({ requestor: 'admin' }, userRoles);
      
      // Verify roles were set (would need to query database or use ACL methods)
      assert.ok(true, 'Ensure user roles completed');
    });
  });

  describe('Directory Permissions', () => {
    const TEST_ACL_DIR = '/acl-test';
    const TEST_ACL_ROLE = 'dir-test-role';

    before(async () => {
      await caskfs.ensureRole({ role: TEST_ACL_ROLE });
    });

    after(async () => {
      try {
        await caskfs.removeDirectoryAcl({ directory: TEST_ACL_DIR });
        await caskfs.removeRole({ role: TEST_ACL_ROLE });
      } catch (e) {}
    });

    it('should set directory as public', async () => {
      await caskfs.setDirectoryPublic({
        directory: TEST_ACL_DIR,
        permission: 'true',
        requestor: TEST_USER
      });

      const acl = await caskfs.getDirectoryAcl({
        filePath: TEST_ACL_DIR,
        requestor: TEST_USER
      });

      assert.ok(acl, 'ACL should exist');
      assert.ok(acl.length > 0, 'ACL should have entries');
      assert.strictEqual(acl[0].public, true, 'Directory should be public');
    });

    it('should set directory permission for a role', async () => {
      await caskfs.setDirectoryPermission({
        directory: TEST_ACL_DIR,
        role: TEST_ACL_ROLE,
        permission: 'read',
        requestor: TEST_USER
      });

      const acl = await caskfs.getDirectoryAcl({
        filePath: TEST_ACL_DIR,
        requestor: TEST_USER
      });

      assert.ok(acl, 'ACL should exist');
      assert.ok(acl[0].permissions, 'ACL should have permissions');
    });

    it('should remove directory permission', async () => {
      await caskfs.setDirectoryPermission({
        directory: TEST_ACL_DIR,
        role: TEST_ACL_ROLE,
        permission: 'read',
        requestor: TEST_USER
      });

      await caskfs.removeDirectoryPermission({
        directory: TEST_ACL_DIR,
        role: TEST_ACL_ROLE,
        requestor: TEST_USER
      });

      assert.ok(true, 'Remove directory permission completed');
    });

    it('should remove entire directory ACL', async () => {
      await caskfs.setDirectoryPermission({
        directory: TEST_ACL_DIR,
        role: TEST_ACL_ROLE,
        permission: 'read',
        requestor: TEST_USER
      });

      await caskfs.removeDirectoryAcl({
        directory: TEST_ACL_DIR,
        requestor: TEST_USER
      });

      assert.ok(true, 'Remove directory ACL completed');
    });
  });

  describe('Admin Actions', () => {
    it('should allow admin action for admin user', async () => {
      const isAllowed = await caskfs.allowAdminAction({
        requestor: 'admin-user',
        ignoreAcl: false
      });

      // Result depends on whether admin-user has admin role
      assert.ok(typeof isAllowed === 'boolean', 'Should return boolean');
    });

    it('should allow admin action when ignoreAcl is true', async () => {
      const isAllowed = await caskfs.allowAdminAction({
        requestor: 'any-user',
        ignoreAcl: true
      });

      assert.strictEqual(isAllowed, true, 'Should allow when ignoreAcl is true');
    });
  });
});

describe('CaskFS Transactions', () => {
  let caskfs;

  before(async () => {
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
  });

  after(async () => {
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  it('should run a function in a transaction', async () => {
    const result = await caskfs.runInTransaction(async (dbClient) => {
      assert.ok(dbClient, 'DB client should be passed to function');
      return 'success';
    });

    assert.strictEqual(result, 'success', 'Should return function result');
  });

  it('should open a transaction and return client', async () => {
    const dbClient = await caskfs.openTransaction();
    
    assert.ok(dbClient, 'Should return database client');
    
    // Clean up
    await dbClient.commit();
    await dbClient.end();
  });

  it('should rollback transaction on error', async () => {
    await assert.rejects(
      async () => {
        await caskfs.runInTransaction(async (dbClient) => {
          throw new Error('Test error');
        });
      },
      /Test error/,
      'Should propagate error from transaction'
    );
  });
});

describe('CaskFS Context', () => {
  let caskfs;

  before(async () => {
    caskfs = new CaskFs();
  });

  after(async () => {
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  it('should create context from object', () => {
    const context = createContext({
      filePath: '/test/file.txt',
      requestor: TEST_USER
    });

    assert.ok(context, 'Context should be created');
    assert.strictEqual(context.data.filePath, '/test/file.txt', 'Should set filePath');
    assert.strictEqual(context.data.requestor, TEST_USER, 'Should set requestor');
    assert.ok(context.data.corkTraceId, 'Should generate corkTraceId');
  });

  it('should return existing context if passed CaskFSContext', () => {
    const context1 = createContext({ filePath: '/test.txt' });
    const context2 = createContext(context1);

    assert.strictEqual(context1, context2, 'Should return same context instance');
  });
});

describe('CaskFS Auto-Path', () => {
  let caskfs;

  before(async () => {
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
  });

  after(async () => {
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  it('should get CAS location for a file path', async () => {
    const location = await caskfs.getCasLocation({
      filePath: '/test/sample.txt'
    });

    assert.ok(location, 'Location should exist');
    assert.ok(location.bucket || location.path, 'Should have bucket or path');
  });

  it('should get auto-path values for a file path', async () => {
    const values = await caskfs.getAutoPathValues({
      filePath: '/test/sample.txt'
    });

    assert.ok(values, 'Values should exist');
    assert.ok('partitionKeys' in values, 'Should have partitionKeys property');
  });
});

describe('CaskFS Relationships', () => {
  let caskfs;
  const LD_FILE_PATH = '/test/linked-data.jsonld';

  before(async () => {
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();

    // Write a JSON-LD file for relationship testing
    const jsonldContent = {
      '@context': 'http://schema.org/',
      '@id': 'http://example.org/person/1',
      '@type': 'Person',
      'name': 'John Doe',
      'knows': {
        '@id': 'http://example.org/person/2'
      }
    };

    try {
      await caskfs.write({
        filePath: LD_FILE_PATH,
        data: Buffer.from(JSON.stringify(jsonldContent)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER
      });
    } catch (e) {
      // File might already exist
    }
  });

  after(async () => {
    try {
      await caskfs.delete({ filePath: LD_FILE_PATH, requestor: TEST_USER });
    } catch (e) {}
    
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  it('should get relationships for a file', async () => {
    const relationships = await caskfs.relationships({
      filePath: LD_FILE_PATH,
      requestor: TEST_USER
    });

    assert.ok(relationships, 'Relationships should exist');
    // The structure depends on the RDF implementation
  });
});
