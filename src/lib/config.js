const env = process.env;

const schemaPrefix = env.CASKFS_SCHEMA_PREFIX || 'cask:/';

const config = {


  rootDir : env.CASKFS_ROOT_DIR || '/opt/caskfs',

  logLevel : env.CASKFS_LOG_LEVEL || 'info',

  schemaPrefix: schemaPrefix,
  fileGraph : schemaPrefix + 'file',
  defaultGraph : schemaPrefix + 'default',

  // first will be used as primary
  digests : ['sha256', 'md5'],

  cliEnvFile : '.caskfs-cli',

  TYPE_PREDICATE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',

  powerwashEnabled: (env.CASKFS_ENABLE_POWERWASH === 'true'),

  database : {
    client : env.CASKFS_DB_CLIENT || 'pg',
    schema : env.CASKFS_DB_SCHEMA || 'caskfs',
  },

  http : {
    host : env.CASKFS_HTTP_HOST || 'http://localhost:3000',
    rootPath : env.CASKFS_HTTP_ROOT_PATH || '/cask',
  },

  postgres : {
    host : env.CASKFS_PG_HOST || 'localhost',
    port : env.CASKFS_PG_PORT || 5432,
    user : env.CASKFS_PG_USER || 'postgres',
    password : env.CASKFS_PG_PASSWORD || 'postgres',
    database : env.CASKFS_PG_DATABASE || 'postgres',
  },

  webapp : {
    port : env.CASKFS_WEBAPP_PORT || 3000,
    isDevEnv : env.CASKFS_WEBAPP_ENV === 'dev',
    bundleName: 'caskfs-webapp.js'
  },

  cloudStorage : {
    enabled : (env.CASKFS_CLOUD_STORAGE_ENABLED === 'true'),
    defaultBucket : env.CASKFS_CLOUD_STORAGE_DEFAULT_BUCKET || 'caskfs',
    project : env.CASKFS_CLOUD_STORAGE_PROJECT || null,
    serviceAccountFile : env.CASKFS_CLOUD_STORAGE_SERVICE_ACCOUNT_FILE || env.GOOGLE_APPLICATION_CREDENTIALS || null,
  },

  acl : {
    enabled : (env.CASKFS_ACL_ENABLED !== 'false'),
    defaultRequestor : env.CASKFS_ACL_DEFAULT_REQUESTOR, // mostly used for internal scripts / integration tests
    adminRole : env.CASKFS_ACL_ADMIN_ROLE || 'admin',
    enabledCache : (env.CASKFS_ACL_ENABLED_CACHE === 'true'),
    cacheTTL : parseInt(env.CASKFS_ACL_CACHE_TTL) || 10 // seconds
  },

  sync : {
    maxFilesPerBatch : parseInt(env.CASKFS_SYNC_MAX_FILES_PER_BATCH) || 1000
  }

}

export default config;