const env = process.env;


const schemaPrefix = env.CASKFS_SCHEMA_PREFIX || 'cask:/';

const config = {


  rootDir : env.CASKFS_ROOT_DIR || '/opt/caskfs',

  schemaPrefix: schemaPrefix,
  fileGraph : schemaPrefix + 'file',
  defaultGraph : schemaPrefix + 'default',

  // first will be used as primary
  digests : ['sha256', 'md5'],

  cliEnvFile : '.caskfs-cli',

  TYPE_PREDICATE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',

  database : {
    client : env.CASKFS_DB_CLIENT || 'pg',
    schema : env.CASKFS_DB_SCHEMA || 'caskfs',
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
    // enabled : (env.CASKFS_ACL_ENABLED !== 'false'),
    enabled :  false,
    adminRole : env.CASKFS_ACL_ADMIN_ROLE || 'admin',
  }

}

export default config;