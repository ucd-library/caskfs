// Set test environment defaults before any modules load.
// Actual env vars take precedence over these defaults.
const defaults = {
  CASKFS_PG_DATABASE: 'testing_caskfs_db',
  CASKFS_ACL_ENABLED: 'false',
  CASKFS_LOG_LEVEL: 'error',
  CASKFS_ENABLE_POWERWASH: 'true'
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
