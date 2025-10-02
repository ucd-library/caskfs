#! /bin/bash

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd $ROOT_DIR

(cd "$ROOT_DIR/.." && npm run client-build-dev)

docker compose -p caskfs-dev up -d