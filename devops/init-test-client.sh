#! /bin/bash

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

export CASKFS_PG_DATABASE=${CASKFS_PG_DATABASE:-caskfs_test}
export CASKFS_ROOT_DIR="$ROOT_DIR/../cache"
export CASKFS_ROOT_DIR="$ROOT_DIR/../test-cache"
export CASKFS_WEBAPP_ENV=${CASKFS_WEBAPP_ENV:-dev}
export CASKFS_ENABLE_POWERWASH=${CASKFS_ENABLE_POWERWASH:-true}

export PGPASSWORD=${CASKFS_PG_PASSWORD:-postgres}
psql -h localhost -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${CASKFS_PG_DATABASE}'" | \
grep -q 1 || \
psql -h localhost -U postgres -c "CREATE DATABASE ${CASKFS_PG_DATABASE}"

node "$ROOT_DIR/../src/bin/cask.js" powerwash
