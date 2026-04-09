const env = process.env;

const schemaPrefix = env.CASKFS_SCHEMA_PREFIX || 'cask:/';
const literalPredicates = (env.CASKFS_LITERAL_PREDICATES ? 
  env.CASKFS_LITERAL_PREDICATES : 
  'http://schema.org/name').split(',').map(s => s.trim()).filter(s => s.length > 0);

const literalPredicateMatches = (env.CASKFS_LITERAL_PREDICATE_MATCHES ?
  env.CASKFS_LITERAL_PREDICATE_MATCHES :
  '(#|\/)name$')
  .split(',')
  .map(s => s.trim())
  .filter(s => s.length > 0)
  .map(s => new RegExp(s));

const stringDataTypes = (env.CASKFS_STRING_DATA_TYPES ?
  env.CASKFS_STRING_DATA_TYPES :
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString, http://www.w3.org/2001/XMLSchema#string')
  .split(',').map(s => s.trim()).filter(s => s.length > 0);

const config = {

  rootDir : env.CASKFS_ROOT_DIR || '/opt/caskfs',

  logLevel : env.CASKFS_LOG_LEVEL || 'info',

  schemaPrefix: schemaPrefix,
  fileGraph : schemaPrefix + 'file',
  defaultGraph : schemaPrefix + 'default',

  // first will be used as primary
  digests : ['sha256', 'md5'],

  cliEnvFile : '.caskfs-cli',

  powerwashEnabled: (env.CASKFS_ENABLE_POWERWASH === 'true'),

  ld : {
    // watch how big you make this, can lead to transaction timeouts if you have
    // a large number of works writing to caskfs at the same time with common uris.
    insertBatchSize : parseInt(env.CASKFS_LD_INSERT_BATCH_SIZE) || 10,
    literalPredicates,
    literalPredicateMatches,
    stringDataTypes,
    typePredicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
  },

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
    lockTimeout : parseInt(env.CASKFS_PG_LOCK_TIMEOUT) || 30, // seconds
    statementTimeout : parseInt(env.CASKFS_PG_STATEMENT_TIMEOUT) || 30 // seconds
  },

  webapp : {
    port : env.CASKFS_WEBAPP_PORT || 3000,
    isDevEnv : env.CASKFS_WEBAPP_ENV === 'dev',
    basepath : env.CASKFS_WEBAPP_PATH_PREFIX || '',
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
    superAdminUser : env.CASKFS_ACL_SUPER_ADMIN_USER || 'admin',
    enabledCache : (env.CASKFS_ACL_ENABLED_CACHE === 'true'),
    cacheTTL : parseInt(env.CASKFS_ACL_CACHE_TTL) || 10 // seconds
  },

  sync : {
    defaultBatchSize : parseInt(env.CASKFS_SYNC_DEFAULT_BATCH_SIZE) || 100,
    maxFilesPerBatch : parseInt(env.CASKFS_SYNC_MAX_FILES_PER_BATCH) || 1000
  },

  git : {
    metadataProperties : ['remote', 'branch', 'commit', 'tag', 'lastCommitTime']
  },

  oidc : {
    url      : env.CASKFS_OIDC_URL       || null,
    clientId : env.CASKFS_OIDC_CLIENT_ID || 'caskfs-cli',
  },

  headerAuth : {
    // When enabled, the server trusts an upstream proxy to populate x-user with
    // a JSON object describing the authenticated user. Only enable this behind a
    // gateway that sets the header — never expose it directly to the internet.
    enabled    : env.CASKFS_HEADER_AUTH_ENABLED === 'true',
    header     : env.CASKFS_HEADER_AUTH_HEADER || 'x-user',

    // Comma-separated list of dot-notation paths to try in order for the username.
    // The first path that resolves to a non-null value is used.
    userPaths  : (env.CASKFS_HEADER_AUTH_USER_PATHS  || 'username,name,sub')
      .split(',').map(s => s.trim()).filter(Boolean),

    // Comma-separated list of dot-notation paths to try in order for the roles.
    // A string value is promoted to a single-element array automatically.
    rolesPaths : (env.CASKFS_HEADER_AUTH_ROLES_PATHS || 'roles,groups')
      .split(',').map(s => s.trim()).filter(Boolean),
  }

}

export default config;