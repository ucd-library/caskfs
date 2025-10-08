#! /bin/bash

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd $ROOT_DIR

if [ "$SKIP_CLIENT_BUILD" != "1" ]; then
  (cd "$ROOT_DIR/.." && npm run client-build-dev)
fi

docker compose -p caskfs-dev up -d