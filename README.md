# CaskFS
**C**ontent-**A**ddressed **S**torage with **K**nowledge graph — **F**ile **S**ystem

A modern data management system for linked data, CaskFS combines a path-addressable filesystem with content-addressed storage and a built-in RDF knowledge graph. Store files by familiar paths, get automatic deduplication from content hashing, and query rich metadata relationships across your entire collection — all in one system.

Contents:
- [Key Capabilities](#key-capabilities)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Usage Examples](#usage-examples)
  - [CLI](#cli)
  - [Node.js Library](#nodejs-library)
  - [HTTP REST API](#http-rest-api)
- [Linked Data Example](#linked-data-example)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Documentation](#documentation)


# Key Capabilities

- **Familiar filesystem paths** — read and write files using `/path/to/file` style addressing
- **Automatic deduplication** — identical file content is stored once regardless of how many paths reference it; hash-based writes let you check existence before uploading
- **Rich file metadata** — attach arbitrary key/value metadata and MIME types to any file
- **Built-in RDF knowledge graph** — JSON-LD files are automatically indexed; binary files get RDF nodes too, enabling cross-file relationship queries
- **Role-based access control** — directory-level ACLs with inherited permissions and a public-read flag
- **Partition keys** — tag files for scoped querying; auto-assign keys based on path patterns
- **Multiple interfaces** — CLI, Node.js library, and HTTP REST API
- **Cloud-ready** — pluggable storage backend supports local disk or Google Cloud Storage; multiple buckets with path-based routing rules


# Architecture

CaskFS is organized into three layers that build on each other:

```
┌─────────────────────────────────────┐
│         Layer 3: RDF Graph          │
│  Query linked data, find files by   │
│  subject/predicate/object, traverse │
│  relationships between files        │
└──────────────────┬──────────────────┘
                   │
┌──────────────────┴──────────────────┐
│       Layer 2: Filesystem           │
│  Path-addressable files/dirs, CRUD  │
│  operations, metadata, ACL, RBAC,   │
│  partition keys                     │
└──────────────────┬──────────────────┘
                   │
┌──────────────────┴──────────────────┐
│       Layer 1: CAS Storage          │
│  SHA-256 content-addressed storage, │
│  deduplication, pairtree layout,    │
│  local disk or GCS backend          │
└─────────────────────────────────────┘
```

**Layer 1 — CAS** stores every file once, keyed by its SHA-256 hash. Identical content written to multiple paths consumes storage only once. See [CAS docs](docs/cas.md).

**Layer 2 — Filesystem** maps human-readable paths onto CAS hashes and manages metadata, directories, access control, and partition keys. This is the primary interface for most operations. See [FS docs](docs/fs.md).

**Layer 3 — RDF Graph** automatically represents every file as an RDF node. JSON-LD files are fully indexed, and any file can be annotated with linked data. Supports SPARQL-style find, relationship traversal, and multi-format RDF export. See [Linked Data docs](docs/ld.md).


# Quick Start

**Prerequisites:** Node.js 18+, Docker (for the dev Postgres instance)

```bash
# 1. Install globally
npm install -g @ucd-lib/caskfs

# 2. Start Postgres (or point CASKFS_PG_* vars at an existing instance)
#    To use the bundled dev compose:
git clone https://github.com/ucd-library/caskfs.git
cd caskfs && ./devops/start-dev.sh

# 3. Initialize the database schema
cask init-pg

# 4. Verify the CLI is working
cask --help
```

Set `CASKFS_ROOT_DIR` to the directory where CAS file data should be stored, and the `CASKFS_PG_*` variables to point at your Postgres instance. See [Configuration](#configuration) for the full list.

To start the web application and REST API:
```bash
cask serve
```

To rebuild the frontend during development (from the cloned repo):
```bash
npm run client-watch
```


# Usage Examples

## CLI

```bash
# Write a file
cask write /research/papers/intro.pdf ./local-intro.pdf

# Write with metadata and a partition key
cask write /research/papers/intro.pdf ./local-intro.pdf \
  --metadata '{"year": "2024"}' \
  --partition-keys research

# List a directory
cask ls /research/papers

# Read a file to stdout
cask read /research/papers/intro.pdf > output.pdf

# Copy a local directory tree into CaskFS
cask copy ./local-papers /research/papers

# Delete a file
cask rm /research/papers/intro.pdf

# Search the RDF graph for files of a given type
cask find --type http://schema.org/Person

# Get file relationships
cask rel /people/alice.jsonld.json
```

## Node.js Library

```js
import CaskFs from '@ucd-lib/caskfs';
import { createReadStream } from 'fs';

const caskFs = new CaskFs({
  rootDir: '/data/caskfs',          // local CAS storage path
  // postgres: { host, port, ... }  // optional DB overrides
});

// Initialize the database schema (first run)
await caskFs.dbClient.init();

// Write a file from a Buffer
await caskFs.write({
  filePath: '/research/papers/intro.pdf',
  data: await fs.promises.readFile('./intro.pdf'),
  requestor: 'alice',
  metadata: { year: '2024', project: 'grant-123' },
  partitionKeys: ['research'],
});

// Write a file from a stream (memory-efficient for large files)
await caskFs.write({
  filePath: '/data/large-dataset.csv',
  readStream: createReadStream('./dataset.csv'),
  requestor: 'alice',
});

// Deduplication: writing the same content to another path
// uses no additional storage space
await caskFs.write({
  filePath: '/archive/2024/intro.pdf',
  data: await fs.promises.readFile('./intro.pdf'),  // same bytes
  requestor: 'alice',
});

// Read a file as a Buffer
const buffer = await caskFs.read({
  filePath: '/research/papers/intro.pdf',
  requestor: 'alice',
});

// Stream a file (efficient for large files or HTTP proxying)
const stream = await caskFs.read(
  { filePath: '/data/large-dataset.csv', requestor: 'alice' },
  { stream: true }
);

// Get file metadata
const meta = await caskFs.metadata({
  filePath: '/research/papers/intro.pdf',
  requestor: 'alice',
});
console.log(meta.hash_value, meta.size, meta.metadata);

// List a directory
const listing = await caskFs.ls({
  directory: '/research/papers',
  requestor: 'alice',
});

// Hash-based write: if the CAS already has this hash, no upload needed
await caskFs.write({
  filePath: '/sync/intro.pdf',
  hash: 'sha256:b3949928361af56ab1e183b258430c005a90991f9d8efbcdfcf0575042895af6',
  requestor: 'alice',
});

// Delete a file
await caskFs.deleteFile({
  filePath: '/research/papers/intro.pdf',
  requestor: 'alice',
});
```

## HTTP REST API

The REST API is available when the server is running (`cask serve`, default port 3000).

```bash
BASE=http://localhost:3000/api
TOKEN=your-bearer-token

# Upload a file (POST creates new; PUT creates or replaces)
curl -X POST "$BASE/fs/research/papers/intro.pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/pdf" \
  --data-binary @intro.pdf

# Download a file
curl "$BASE/fs/research/papers/intro.pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -o output.pdf

# Byte-range request (e.g. for streaming video or resumable downloads)
curl "$BASE/fs/media/lecture.mp4" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Range: bytes=0-1048575"

# Get file metadata (JSON)
curl "$BASE/fs/research/papers/intro.pdf?metadata=true" \
  -H "Authorization: Bearer $TOKEN"

# Or use the Accept header
curl "$BASE/fs/research/papers/intro.pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.caskfs.file-metadata+json"

# List a directory
curl "$BASE/dir/research/papers" \
  -H "Authorization: Bearer $TOKEN"

# Delete a file
curl -X DELETE "$BASE/fs/research/papers/intro.pdf" \
  -H "Authorization: Bearer $TOKEN"

# Search the RDF graph for files by type
curl "$BASE/find?type=http://schema.org/Person" \
  -H "Authorization: Bearer $TOKEN"

# Fetch linked data for a file
curl "$BASE/ld?file=/people/alice.jsonld.json" \
  -H "Authorization: Bearer $TOKEN"
```

For the full REST API reference see [FS REST API](docs/fs-rest-api.md) and [LD REST API](docs/ld-rest-api.md).


# Linked Data Example

CaskFS automatically represents every file as an RDF node in the `cask://` URI scheme. When a file is a JSON-LD document, its triples are also indexed, enabling cross-file queries and relationship traversal.

**1. Write a JSON-LD file describing a person:**

`/people/alice.jsonld.json`
```json
{
  "@id": "https://example.org/people/alice",
  "@type": "http://schema.org/Person",
  "http://schema.org/name": "Alice Smith",
  "http://schema.org/image": { "@id": "cask://photos/alice.jpg" },
  "http://schema.org/colleague": { "@id": "https://example.org/people/bob" }
}
```

**2. Write a binary file; annotate it from the JSON-LD file using a relative path reference:**

`/photos/alice.jpg` — a regular JPEG  
`/photos/alice.jpg.jsonld.json` — metadata sidecar (the `cask:/` id means "annotate the sibling file")

```json
{
  "@id": "cask:/",
  "http://schema.org/description": "Alice's profile photo, taken 2024",
  "http://schema.org/dateCreated": "2024-06-01"
}
```

**3. Query:**

```bash
# Find all Person files
cask find --type http://schema.org/Person

# Get outbound and inbound relationships for alice's file
cask rel /people/alice.jsonld.json

# Fetch the merged JSON-LD graph for alice's photo (CAS metadata + sidecar annotations)
cask rdf --file /photos/alice.jpg
```

The relationship query for `/people/alice.jsonld.json` returns:
```json
{
  "source": { "file": "/people/alice.jsonld.json", "resourceType": "rdf" },
  "outbound": {
    "http://schema.org/image":     ["/photos/alice.jpg"],
    "http://schema.org/colleague": ["/people/bob.jsonld.json"]
  },
  "inbound": {}
}
```

See the [Linked Data docs](docs/ld.md) for the full reference binary file and relationship model.


# Configuration

CaskFS is configured via environment variables. All variables are optional and fall back to sensible defaults for local development.

| Variable | Default | Description |
|---|---|---|
| `CASKFS_ROOT_DIR` | `/opt/caskfs` | Root directory for local CAS file storage |
| `CASKFS_PG_HOST` | `localhost` | Postgres host |
| `CASKFS_PG_PORT` | `5432` | Postgres port |
| `CASKFS_PG_USER` | `postgres` | Postgres user |
| `CASKFS_PG_PASSWORD` | `postgres` | Postgres password |
| `CASKFS_PG_DATABASE` | `postgres` | Postgres database name |
| `CASKFS_DB_SCHEMA` | `caskfs` | Postgres schema name |
| `CASKFS_WEBAPP_PORT` | `3000` | HTTP server port |
| `CASKFS_WEBAPP_PATH_PREFIX` | _(none)_ | Mount prefix for the HTTP server (e.g. `/cask`) |
| `CASKFS_ACL_ENABLED` | `true` | Enable role-based access control |
| `CASKFS_ACL_ADMIN_ROLE` | `admin` | Role name that bypasses all ACL checks |
| `CASKFS_LOG_LEVEL` | `info` | Log level (`error`, `warn`, `info`, `debug`) |
| `CASKFS_CLOUD_STORAGE_ENABLED` | `false` | Use Google Cloud Storage as the CAS backend |
| `CASKFS_CLOUD_STORAGE_DEFAULT_BUCKET` | `caskfs` | Default GCS bucket name |
| `CASKFS_CLOUD_STORAGE_PROJECT` | _(none)_ | GCP project ID |
| `CASKFS_ENABLE_POWERWASH` | `false` | Allow the `init-pg --powerwash` command to drop and recreate the schema |


# Deployment

## Local / Docker Compose

The `devops/` directory includes a `compose.yaml` with a Postgres service suitable for local development and small deployments:

```bash
./devops/start-dev.sh   # starts Postgres via Docker Compose
./devops/stop-dev.sh    # stops it
```

CAS file data is stored on the local filesystem at `CASKFS_ROOT_DIR`. The Node.js process can be run directly or containerized.

## Google Cloud

For production deployments on GCP:

- **CAS Layer 1** — set `CASKFS_CLOUD_STORAGE_ENABLED=true`; files are stored in GCS instead of local disk. Multiple buckets can be assigned using [Auto Path Rules](docs/auto-path.md) to route files to different buckets or storage classes based on their path.
- **Filesystem + RDF Layers** — run in Cloud Run or any container environment.
- **Database** — Cloud SQL (Postgres).

The [RBAC system](docs/rbac.md) integrates with an external OIDC provider (e.g. Keycloak) for bearer token authentication.


# Documentation

| Topic | Link |
|---|---|
| Content-Addressed Storage (Layer 1) | [docs/cas.md](docs/cas.md) |
| Filesystem Layer (Layer 2) | [docs/fs.md](docs/fs.md) |
| Filesystem REST API | [docs/fs-rest-api.md](docs/fs-rest-api.md) |
| Linked Data / RDF (Layer 3) | [docs/ld.md](docs/ld.md) |
| Linked Data REST API | [docs/ld-rest-api.md](docs/ld-rest-api.md) |
| Role-Based Access Control | [docs/rbac.md](docs/rbac.md) |
| Auto Path / Partition Rules | [docs/auto-path.md](docs/auto-path.md) |
