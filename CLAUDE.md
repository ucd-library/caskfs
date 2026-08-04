# CaskFS

See [README.md](README.md) for architecture, usage, and API docs, and [docs/](docs/) for per-layer deep dives.

## Running tests

```bash
SKIP_CLIENT_BUILD=1 ./devops/start-dev.sh   # starts the dev Postgres instance
npx mocha --exit                             # always pass --exit
```

Tests self-provision their own database/schema against the running Postgres instance — no manual DB setup needed. See the [Testing](README.md#testing) section in the README for why `--exit` is required and how to isolate a single test file (`.mocharc.yml`'s file list isn't overridden by a positional mocha argument).
