#! /bin/bash

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

export CASKFS_PG_DATABASE=${CASKFS_PG_DATABASE:-caskfs_db}
export CASKFS_ROOT_DIR="$ROOT_DIR/../cache"
export CASKFS_WEBAPP_ENV=${CASKFS_WEBAPP_ENV:-dev}
export CASKFS_ENABLE_POWERWASH=${CASKFS_ENABLE_POWERWASH:-true}

node "$ROOT_DIR/test-router.js"