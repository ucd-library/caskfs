import CaskFs from '../src/index.js';
import config from '../src/lib/config.js';

/**
 * Test utilities and helpers for CaskFS testing
 */

/**
 * Setup test environment
 * @returns {Object} Test configuration and helpers
 */
export async function setupTestEnvironment() {
  const caskfs = new CaskFs();
  await caskfs.dbClient.connect();
  
  return {
    caskfs,
    config,
    cleanup: async () => {
      if (caskfs && caskfs.dbClient) {
        await caskfs.dbClient.end();
      }
    }
  };
}

/**
 * Clean up test files in a directory
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {Array<string>} filePaths - Array of file paths to delete
 * @param {string} requestor - User requesting the deletion
 */
export async function cleanupFiles(caskfs, filePaths, requestor = 'test-user') {
  for (const filePath of filePaths) {
    try {
      await caskfs.delete({ filePath, requestor });
    } catch (e) {
      // Ignore errors if file doesn't exist
    }
  }
}

/**
 * Create test files for testing
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {Object} filesConfig - Object mapping file paths to content
 * @param {string} requestor - User creating the files
 * @returns {Promise<Array>} Array of created file paths
 */
export async function createTestFiles(caskfs, filesConfig, requestor = 'test-user') {
  const filePaths = [];
  
  for (const [filePath, content] of Object.entries(filesConfig)) {
    const data = typeof content === 'string' ? Buffer.from(content) : content;
    
    await caskfs.write({
      filePath,
      data,
      requestor
    });
    
    filePaths.push(filePath);
  }
  
  return filePaths;
}

/**
 * Ensure powerwash is enabled for tests
 * @returns {boolean} Whether powerwash is enabled
 */
export function checkPowerwashEnabled() {
  if (!config.powerWashEnabled) {
    console.warn('⚠️  Warning: Powerwash is not enabled. Set CASKFS_ENABLE_POWERWASH=true');
    return false;
  }
  return true;
}

/**
 * Run powerwash if enabled
 * @param {CaskFs} caskfs - CaskFS instance
 */
export async function runPowerwash(caskfs) {
  if (config.powerWashEnabled) {
    console.log('🧹 Running powerwash to reset state...');
    await caskfs.powerWash();
    console.log('✅ Powerwash complete');
  } else {
    console.warn('⚠️  Skipping powerwash - not enabled');
  }
}

/**
 * Create a test user with specified roles
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {string} username - Username to create
 * @param {Array<string>} roles - Array of role names
 */
export async function createTestUser(caskfs, username, roles = []) {
  await caskfs.ensureUser({ user: username });
  
  for (const role of roles) {
    await caskfs.ensureRole({ role });
    await caskfs.setUserRole({ user: username, role });
  }
}

/**
 * Clean up test user and their roles
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {string} username - Username to clean up
 * @param {Array<string>} roles - Array of role names to remove
 */
export async function cleanupTestUser(caskfs, username, roles = []) {
  for (const role of roles) {
    try {
      await caskfs.removeUserRole({ user: username, role });
    } catch (e) {}
  }
  
  for (const role of roles) {
    try {
      await caskfs.removeRole({ role });
    } catch (e) {}
  }
}

/**
 * Generate random test content
 * @param {number} size - Size in bytes
 * @returns {Buffer} Random buffer
 */
export function generateRandomContent(size = 1024) {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

/**
 * Create a sample JSON-LD document
 * @param {string} id - Document ID
 * @param {string} type - Document type
 * @returns {Object} JSON-LD document
 */
export function createSampleJsonLd(id, type = 'Thing') {
  return {
    '@context': 'http://schema.org/',
    '@id': id,
    '@type': type,
    'name': `Test ${type}`,
    'dateCreated': new Date().toISOString()
  };
}

/**
 * Wait for a specified duration (useful for async operations)
 * @param {number} ms - Milliseconds to wait
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a file exists in CaskFS
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {string} filePath - File path to check
 * @param {string} message - Assertion message
 */
export async function assertFileExists(caskfs, filePath, message = 'File should exist') {
  const exists = await caskfs.exists({ filePath });
  if (!exists) {
    throw new Error(`${message}: ${filePath}`);
  }
}

/**
 * Assert that a file does not exist in CaskFS
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {string} filePath - File path to check
 * @param {string} message - Assertion message
 */
export async function assertFileNotExists(caskfs, filePath, message = 'File should not exist') {
  const exists = await caskfs.exists({ filePath });
  if (exists) {
    throw new Error(`${message}: ${filePath}`);
  }
}

/**
 * Get all files in a directory recursively
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {string} directory - Directory path
 * @param {string} requestor - User requesting the listing
 * @returns {Promise<Array>} Array of file paths
 */
export async function getAllFilesInDirectory(caskfs, directory, requestor = 'test-user') {
  const result = await caskfs.ls({ directory, requestor });
  return result.files.map(f => `${f.directory}${f.filename}`);
}

/**
 * Compare file content
 * @param {CaskFs} caskfs - CaskFS instance
 * @param {string} filePath - File path
 * @param {string|Buffer} expectedContent - Expected content
 * @param {string} requestor - User requesting the read
 */
export async function assertFileContent(caskfs, filePath, expectedContent, requestor = 'test-user') {
  const content = await caskfs.read({ filePath, requestor });
  const expected = typeof expectedContent === 'string' ? Buffer.from(expectedContent) : expectedContent;
  
  if (!content.equals(expected)) {
    throw new Error(`File content mismatch for ${filePath}`);
  }
}

export default {
  setupTestEnvironment,
  cleanupFiles,
  createTestFiles,
  checkPowerwashEnabled,
  runPowerwash,
  createTestUser,
  cleanupTestUser,
  generateRandomContent,
  createSampleJsonLd,
  wait,
  assertFileExists,
  assertFileNotExists,
  getAllFilesInDirectory,
  assertFileContent
};
