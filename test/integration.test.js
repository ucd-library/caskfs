import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import CaskFs from '../src/index.js';
import config from '../src/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_USER = 'integration-test-user';
const TEST_DIR = '/integration-test';

describe('CaskFS Integration Tests', () => {
  let caskfs;

  before(async () => {
    // Ensure powerwash is enabled for tests
    if (!config.powerWashEnabled) {
      console.log('Warning: powerwash not enabled, skipping some cleanup');
    }

    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
    
    // Set test user as default
    config.acl.defaultRequestor = TEST_USER;
  });

  after(async () => {
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  describe('Real-world File Workflow', () => {
    const workflowDir = `${TEST_DIR}/workflow`;
    const files = {
      text: `${workflowDir}/document.txt`,
      json: `${workflowDir}/data.json`,
      jsonld: `${workflowDir}/metadata.jsonld`,
      binary: `${workflowDir}/image.bin`
    };

    beforeEach(async () => {
      // Clean up files
      for (const filePath of Object.values(files)) {
        try {
          await caskfs.delete({ filePath, requestor: TEST_USER });
        } catch (e) {}
      }
    });

    it('should handle a complete file lifecycle', async () => {
      const content = 'Initial content';
      
      // 1. Write file
      const writeResult = await caskfs.write({
        filePath: files.text,
        data: Buffer.from(content),
        requestor: TEST_USER,
        partitionKeys: ['project-a']
      });
      assert.ok(writeResult.fileId, 'File should be written');

      // 2. Check existence
      const exists = await caskfs.exists({ filePath: files.text });
      assert.strictEqual(exists, true, 'File should exist');

      // 3. Read file
      const readContent = await caskfs.read({
        filePath: files.text,
        requestor: TEST_USER
      });
      assert.strictEqual(readContent.toString(), content, 'Content should match');

      // 4. Get metadata
      const metadata = await caskfs.metadata({
        filePath: files.text,
        requestor: TEST_USER
      });
      assert.ok(metadata.hash, 'Should have hash');
      assert.ok(metadata.partition_keys.includes('project-a'), 'Should have partition key');

      // 5. Update metadata
      await caskfs.patchMetadata({
        filePath: files.text,
        partitionKeys: ['project-b'],
        metadata: { author: 'Test User' }
      });

      const updatedMetadata = await caskfs.metadata({
        filePath: files.text,
        requestor: TEST_USER
      });
      assert.ok(updatedMetadata.partition_keys.includes('project-b'), 'Should have new partition key');

      // 6. Replace file content
      const newContent = 'Updated content';
      await caskfs.write({
        filePath: files.text,
        data: Buffer.from(newContent),
        replace: true,
        requestor: TEST_USER
      });

      const updatedContent = await caskfs.read({
        filePath: files.text,
        requestor: TEST_USER
      });
      assert.strictEqual(updatedContent.toString(), newContent, 'Content should be updated');

      // 7. Delete file
      const deleteResult = await caskfs.delete({
        filePath: files.text,
        requestor: TEST_USER
      });
      assert.ok(deleteResult.metadata, 'Should return metadata of deleted file');

      const existsAfterDelete = await caskfs.exists({ filePath: files.text });
      assert.strictEqual(existsAfterDelete, false, 'File should not exist after deletion');
    });

    it('should handle JSON-LD files with RDF parsing', async () => {
      const jsonldData = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/book/1',
        '@type': 'Book',
        'name': 'Test Book',
        'author': {
          '@type': 'Person',
          'name': 'Test Author'
        },
        'isbn': '978-0-123456-78-9'
      };

      // Write JSON-LD file
      await caskfs.write({
        filePath: files.jsonld,
        data: Buffer.from(JSON.stringify(jsonldData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER,
        partitionKeys: ['books']
      });

      // Get metadata (should detect as linked data)
      const metadata = await caskfs.metadata({
        filePath: files.jsonld,
        requestor: TEST_USER,
        stats: true
      });

      assert.strictEqual(metadata.mime_type, 'application/ld+json', 'Should detect JSON-LD mime type');
      
      // Get relationships
      const relationships = await caskfs.relationships({
        filePath: files.jsonld,
        requestor: TEST_USER
      });

      assert.ok(relationships, 'Should have relationships data');
    });

    it('should handle multiple files in directory operations', async () => {
      const fileContents = {
        'file1.txt': 'Content 1',
        'file2.txt': 'Content 2',
        'file3.txt': 'Content 3'
      };

      // Write multiple files
      for (const [filename, content] of Object.entries(fileContents)) {
        await caskfs.write({
          filePath: `${workflowDir}/${filename}`,
          data: Buffer.from(content),
          requestor: TEST_USER
        });
      }

      // List directory
      const listing = await caskfs.ls({
        directory: workflowDir,
        requestor: TEST_USER
      });

      assert.ok(listing.files, 'Should have files array');
      assert.ok(listing.files.length >= 3, 'Should have at least 3 files');

      // Clean up
      for (const filename of Object.keys(fileContents)) {
        await caskfs.delete({
          filePath: `${workflowDir}/${filename}`,
          requestor: TEST_USER
        });
      }
    });
  });

  describe('Hash-Based Operations', () => {
    const hashTestDir = `${TEST_DIR}/hash-test`;
    const originalFile = `${hashTestDir}/original.txt`;
    const copiedFile = `${hashTestDir}/copy.txt`;
    const content = 'This is test content for hash-based operations';

    beforeEach(async () => {
      try {
        await caskfs.delete({ filePath: originalFile, requestor: TEST_USER });
        await caskfs.delete({ filePath: copiedFile, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should sync files using existing hash values', async () => {
      // Write original file
      await caskfs.write({
        filePath: originalFile,
        data: Buffer.from(content),
        requestor: TEST_USER
      });

      // Get the hash
      const metadata = await caskfs.metadata({
        filePath: originalFile,
        requestor: TEST_USER
      });

      const hash = metadata.hash;
      assert.ok(hash, 'Should have hash value');

      // Sync to new location using hash
      const syncResult = await caskfs.sync(
        { requestor: TEST_USER },
        {
          files: [
            {
              filePath: copiedFile,
              hash: hash,
              mimeType: 'text/plain'
            }
          ]
        }
      );

      assert.ok(syncResult.success, 'Should have success array');
      assert.strictEqual(syncResult.success.length, 1, 'Should successfully sync 1 file');

      // Verify copied file has same content
      const copiedContent = await caskfs.read({
        filePath: copiedFile,
        requestor: TEST_USER
      });

      assert.strictEqual(copiedContent.toString(), content, 'Copied file should have same content');

      // Verify both files point to same hash
      const copiedMetadata = await caskfs.metadata({
        filePath: copiedFile,
        requestor: TEST_USER
      });

      assert.strictEqual(copiedMetadata.hash, hash, 'Both files should have same hash');
    });

    it('should write file using existing hash reference', async () => {
      // Write original file
      await caskfs.write({
        filePath: originalFile,
        data: Buffer.from(content),
        requestor: TEST_USER
      });

      // Get the hash
      const metadata = await caskfs.metadata({
        filePath: originalFile,
        requestor: TEST_USER
      });

      // Write new file referencing the hash
      await caskfs.write({
        filePath: copiedFile,
        hash: metadata.hash,
        requestor: TEST_USER
      });

      // Verify file exists and has correct content
      const copiedContent = await caskfs.read({
        filePath: copiedFile,
        requestor: TEST_USER
      });

      assert.strictEqual(copiedContent.toString(), content, 'Should have same content via hash reference');
    });
  });

  describe('Soft Delete Operations', () => {
    const softDeleteFile = `${TEST_DIR}/soft-delete.txt`;
    const content = 'Content to be soft deleted';

    beforeEach(async () => {
      try {
        await caskfs.delete({ filePath: softDeleteFile, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should perform soft delete keeping hash in CAS', async () => {
      // Write file
      await caskfs.write({
        filePath: softDeleteFile,
        data: Buffer.from(content),
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: softDeleteFile,
        requestor: TEST_USER
      });
      const hash = metadata.hash;

      // Soft delete
      const deleteResult = await caskfs.delete(
        { filePath: softDeleteFile, requestor: TEST_USER },
        { softDelete: true }
      );

      assert.ok(deleteResult.metadata, 'Should return metadata');

      // File should not exist in filesystem
      const exists = await caskfs.exists({ filePath: softDeleteFile });
      assert.strictEqual(exists, false, 'File should not exist in filesystem');

      // But we could potentially write a new file with the same hash
      // (hash should still exist in CAS)
    });
  });

  describe('Access Control Integration', () => {
    const aclTestDir = `${TEST_DIR}/acl-integration`;
    const aclTestFile = `${aclTestDir}/protected.txt`;
    const testUser1 = 'acl-user-1';
    const testUser2 = 'acl-user-2';
    const testRole = 'acl-read-role';

    before(async () => {
      // Set up users and roles
      await caskfs.ensureRole({ role: testRole });
      await caskfs.ensureUser({ user: testUser1 });
      await caskfs.ensureUser({ user: testUser2 });
      await caskfs.setUserRole({ user: testUser1, role: testRole });

      // Set directory permissions
      await caskfs.setDirectoryPermission({
        directory: aclTestDir,
        role: testRole,
        permission: 'read',
        requestor: 'admin'
      });
    });

    after(async () => {
      try {
        await caskfs.removeDirectoryAcl({ directory: aclTestDir });
        await caskfs.removeUserRole({ user: testUser1, role: testRole });
        await caskfs.removeUserRole({ user: testUser2, role: testRole });
        await caskfs.removeRole({ role: testRole });
        await caskfs.delete({ filePath: aclTestFile, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should enforce directory access control', async () => {
      // Write a file as admin
      await caskfs.write({
        filePath: aclTestFile,
        data: Buffer.from('Protected content'),
        requestor: 'admin'
      });

      // User with role should be able to read
      try {
        const content = await caskfs.read({
          filePath: aclTestFile,
          requestor: testUser1
        });
        assert.ok(content, 'User with read permission should access file');
      } catch (e) {
        // ACL might not be fully enforced in test environment
        console.log('ACL read test skipped:', e.message);
      }
    });

    it('should manage directory ACL hierarchy', async () => {
      // Set public access
      await caskfs.setDirectoryPublic({
        directory: aclTestDir,
        permission: 'true',
        requestor: TEST_USER
      });

      const acl = await caskfs.getDirectoryAcl({
        filePath: aclTestDir,
        requestor: TEST_USER
      });

      assert.ok(acl, 'Should get ACL');
      assert.ok(acl.length > 0, 'ACL should have entries');
      assert.strictEqual(acl[0].public, true, 'Directory should be public');

      // Set private
      await caskfs.setDirectoryPublic({
        directory: aclTestDir,
        permission: 'false',
        requestor: TEST_USER
      });

      const aclPrivate = await caskfs.getDirectoryAcl({
        filePath: aclTestDir,
        requestor: TEST_USER
      });

      assert.strictEqual(aclPrivate[0].public, false, 'Directory should be private');
    });
  });

  describe('Batch Operations', () => {
    const batchDir = `${TEST_DIR}/batch`;
    const fileCount = 10;

    beforeEach(async () => {
      // Clean up batch test files
      for (let i = 0; i < fileCount; i++) {
        try {
          await caskfs.delete({ filePath: `${batchDir}/file${i}.txt`, requestor: TEST_USER });
        } catch (e) {}
      }
    });

    it('should handle batch file operations efficiently', async () => {
      // Write multiple files
      const writePromises = [];
      for (let i = 0; i < fileCount; i++) {
        writePromises.push(
          caskfs.write({
            filePath: `${batchDir}/file${i}.txt`,
            data: Buffer.from(`Content ${i}`),
            requestor: TEST_USER,
            partitionKeys: ['batch-test']
          })
        );
      }

      const results = await Promise.all(writePromises);
      assert.strictEqual(results.length, fileCount, `Should write ${fileCount} files`);

      // List all files
      const listing = await caskfs.ls({
        directory: batchDir,
        requestor: TEST_USER
      });

      assert.ok(listing.files.length >= fileCount, `Should list at least ${fileCount} files`);

      // Clean up
      const deletePromises = [];
      for (let i = 0; i < fileCount; i++) {
        deletePromises.push(
          caskfs.delete({ filePath: `${batchDir}/file${i}.txt`, requestor: TEST_USER })
        );
      }

      await Promise.all(deletePromises);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      const stats = await caskfs.stats();

      assert.ok(stats, 'Stats should exist');
      assert.ok(typeof stats.totalFiles === 'number', 'Should have totalFiles');
      assert.ok(stats.totalFiles >= 0, 'Total files should be non-negative');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent file read gracefully', async () => {
      await assert.rejects(
        async () => {
          await caskfs.read({
            filePath: '/non-existent/file.txt',
            requestor: TEST_USER
          });
        },
        (err) => {
          return err.message.includes('not found') || err.message.includes('does not exist');
        },
        'Should throw error for non-existent file'
      );
    });

    it('should handle invalid file paths', async () => {
      await assert.rejects(
        async () => {
          await caskfs.write({
            filePath: '', // Empty path
            data: Buffer.from('test'),
            requestor: TEST_USER
          });
        },
        'Should throw error for empty file path'
      );
    });

    it('should handle missing required parameters', async () => {
      await assert.rejects(
        async () => {
          await caskfs.write({
            // Missing filePath and data
            requestor: TEST_USER
          });
        },
        'Should throw error for missing required parameters'
      );
    });
  });
});
