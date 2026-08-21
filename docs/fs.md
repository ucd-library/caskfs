# File System - Layer 2 ( `fs` )

[Back to Overview](../README.md)

The file system layer is the main layer of user interaction with CaskFS. It provides a filesystem-like interface for users to interact with the underlying [content-addressable storage (CAS Layer 1)](cas.md) system. This layer is responsible for handling file operations such as reading, writing, deleting, and listing files and directories.

Contents:
- [Key Features](#key-features)
- [File System - Rest API](fs-rest-api.md)
- [File System - CLI Methods](#file-system-cli-methods)
- [Directory Access Control](rbac.md)

## Key Features

- **Filesystem Interface**: Provides a familiar filesystem interface for users to interact with files and directories.
- **Role-Based Access Control**: Implements [role-based access control](rbac.md) to manage permissions for different users at the directory level.
- **Virtual Directories**: Like cloud storage systems, CaskFS directories are virtual and do not exist as physical entities in the storage backend.  This allows for concepts like empty directories and directories with the same name as files or files nested within files.  This allows for easy syncing between your existing cloud storage and CaskFS.
- **Partition Key**: Each file can be associated with one or more partition keys, which can be used to group related files together. This is most useful when interfacting with CaskFS via the [RDF Layer (Layer 3)](ld.md) as all queries are scoped to a specific partition key.
- **Auto Partition Key**: Each file can be automatically assigned a partition key based on the directory it is created in.  You can specify rules for how partition keys are assigned based on directory paths. See the [Auto Path Documentation](auto-path.md) for more details.
- **File Metadata**: Each file can have arbitrary key-value metadata pairs associated with it.
- **Containment**: Each file is automatically injected into the RDF layer (Layer 3).  The file in Layer 3 follows the [LDP Basic Container](https://www.w3.org/TR/ldp/#ldp-basic-container) ideology allowing for easier interaction and data management of the RDF graph.  If the file is a JSON-LD file, the contents of the file are included in the RDF graph as well.
- **Custom Mime Types**: Each file can have a custom MIME type associated with it.  By default, CaskFS will attempt to infer the MIME type based on the file extension.
- **Hash-Based Writes**: You can optimistically write files by providing the SHA256 hash of the file content and file path.  If the SHA256 hash already exists in the CAS Layer (Layer 1), the write will succeed.  This is useful for various file layout patterns such as; weekly harvests where data is often unchanged, or large binary files moving between stage and production directories.  Finally, this mechanism can be used to efficiently sync files between CaskFS instances.

## File System CLI Methods

### Write

Write is the basic method for adding or updating a file in CaskFS.

CLI: `cask write <file-path> [options]`

Pass `--derived-from <source-path>` (repeatable) to record a [lineage link](structural-metadata.md#three-structural-facets) from the file being written to one or more existing source files in the same call — e.g. `cask write /silver/report.parquet -d report.parquet --derived-from /bronze/raw.csv`. Equivalent to a separate `cask lineage add` call after the write.

### Copy

Copy entire directories from a the local filesystem into CaskFS, or from one path in CaskFS to another.  This is a recursive operation and will always overwrite files in the destination path.

CLI: `cask copy <source-path> <destination-path> [options]`

### Move

Rename or move a file or directory within CaskFS (`cask:` → `cask:` only — use Copy for transfers to/from local disk). The `file_id`/`directory_id` and everything keyed by them (partition keys, [lineage links](structural-metadata.md#three-structural-facets)) are unchanged; only the path is rewritten. Destination parent directories are created automatically. Fails if the destination path already exists — there is no unix-`mv`-style nesting into an existing directory.

After the move commits, `mv` automatically [reharvests](ld.md#reharvest) the moved file (or, for a directory, every RDF file in the subtree) so any [relative `cask:/` references](ld.md#reference-binary-file) they contain resolve against their new location — see [the known boundary](structural-metadata.md#a-known-boundary) this does and doesn't close.

For a single-file move that changes the file's extension, `resourceType` is always rechecked against the new extension (harmless either way, since it's derived purely from the path). `mimeType` is left untouched unless `--recheck-mime-type` is passed, since it may have been set manually and a rename doesn't change file bytes. If the recheck flips `resourceType` away from `rdf`, that file's now-stale content triples are purged as part of the same move.

CLI: `cask mv <source-path> <destination-path> [--recheck-mime-type]`

### Read
Read is the basic method for reading a file from CaskFS.

CLI: `cask read <file-path> [options]`

### List
List is the basic method for listing files and directories in CaskFS.

CLI: `cask ls <directory-path> [options]`

### Delete
Delete is the basic method for deleting a file from CaskFS.

Pass `-l`/`--delete-lineage` (`deleteLineage` over the API/library) to also recursively delete every
downstream [lineage](structural-metadata.md#three-structural-facets) derivative of the file(s) being
removed — i.e. files derived from it, and files derived from those, transitively. Without the flag,
only the file(s) targeted by the delete are removed; lineage edges (`derivative_link` rows) pointing at
a deleted file are cleaned up automatically regardless of the flag, since they're keyed by `file_id`
and cascade-delete with either endpoint.

CLI: `cask rm <file-path> [options]`
