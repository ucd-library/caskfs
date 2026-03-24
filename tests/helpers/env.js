// Set test environment defaults before any modules load.
// Actual env vars take precedence over these defaults.
const defaults = {
  CASKFS_PG_DATABASE: 'caskfs_db',
  CASKFS_ACL_ENABLED: 'false',
  CASKFS_LOG_LEVEL: 'error',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
