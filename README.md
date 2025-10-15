# CASK-FS
<b>C</b>ontent-<b>A</b>ddressed <b>S</b>torage with <b>K</b>nowledge graph - <b>F</b>ile <b>S</b>ystem.

Contents:
- [Quick Start - Local Development](#quick-start---local-development)
- [General Concepts](#general-concepts)
  - [Content-Addressed Storage (CAS) - Layer 1](./docs/cas.md)
  - [File System (FS) - Layer 2](./docs/fs.md)
  - [Linked Data (RDF) - Layer 3](./docs/ld.md)
- [Interacting with CaskFS](#interacting-with-caskfs)
- [As-a-Service](#as-a-service)


# Quick Start - Local Development

- Checkout this repo
- Install npm dependencies: `npm i`
- Start the dev pg server: `./devops/start-dev.sh`
- Init the database: `./devops/cli.sh init-pg`
- Start using CASKFS: `./devops/cli.sh help`

Notes.  The `./devops/cli.sh` script sets the `CASKFS_ROOT_DIR` to the `cache` directory in the repo.  This is where all CASKFS data will be stored.  You can change this by setting the `CASKFS_ROOT_DIR` environment variable to another path.  Additonally the `cli.sh` sets the connection to the local dev pg server and the `caskfs_db` database.  

## Webapp
- Start the webapp: `./devops/cli.sh serve`
- Start the watch process: `npm run client-watch`
- Add an icon:
  - edit icons array in `src/client/build/icons.js`
  - restart watch process
  - restart server


# General Concepts

## Layers

There are three layers to CaskFS:
  1. The [Content-Addressed Storage (CAS) Layer 1](docs/cas.md) which stores all files by their SHA256 hash.  Additionally a metadata file is stored for each file in CAS, which contains a copy of all additional data stored about the file in the database.
  2. The [File System (FS) Layer 2](docs/fs.md) which provides a filesystem-like hierarchy of files and directories, where files can be either binary files in or JSON-LD metadata files.
  3. The [Linked Data (RDF) Layer 3](docs/ld.md) which represents all linked data from the JSON-LD files (including references to binary/non-RDF files) and allows for linking (referencing) RDF and binary/non-RDF files.


```
+-----------------------------+
|      Layer 3: RDF Graph     |
|  (Linked Data, find,        | <-- RDF retrieval and 
|       relationships)        |     file relationships
+-------------/\---------------+
              |
+-------------|---------------+
| Layer 2: Filesystem Layer   |
| (Hierarchical files/dirs,   | <-- Data operations 
|  binary & metadata)         |     (CRUD, list, etc)
+-------------|---------------+
              |
+------------ \/ ---------------+
| Layer 1: CAS Storage Layer  |
| (SHA256-addressed files,    |
|  CAS metadata)              |
+-----------------------------+
```

# Interacting with CaskFS

Writes are done via [the filesystem layer](docs/fs.md).  [The CAS layer](docs/cas.md) is not directly interacted with.  [The RDF layer 3](docs/ld.md) is a readonly layer allowing for; retrieving RDF data, finding relationships between files, and querying for files based on their RDF data.

There is both a CLI and REST API for interacting with CaskFS.  The CLI is a thin wrapper (will have) two flavors; one for when you have direct access to the CAS disk storage and Database, and one for when you only have access to the REST API (Still to be implemented).

# As-a-Service

CaskFS is designed to run both hosted locally and as-a-service.  For instance, in Google Cloud; 
 - The CAS Layer 1 can use Google Cloud Storage as the backend storage.
 - The FS Layer 2 and RDF Layer 3 can run in a Google Cloud Run instance.
 - The Database can run in a Google Cloud SQL Postgres instance.