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
- **Role-Based Access Control**: Implements role-based access control to manage permissions for different users at the directory level.
- **Virtual Directories**: Like cloud storage systems, CaskFS directories are virtual and do not exist as physical entities in the storage backend.  This allows for concepts like empty directories and directories with the same name as files or files nested within files.  This allows for easy syncing between your existing cloud storage and CaskFS.
- **Partition Key**: Each file can be associated with one or more partition keys, which can be used to group related files together. This is most useful when interfacting with CaskFS via the [RDF Layer (Layer 3)](rdf.md) as all queries are scoped to a specific partition key.
- **Auto Partition Key**: Each file can be automatically assigned a partition key based on the directory it is created in.  You can specify rules for how partition keys are assigned based on directory paths. See the [Auto Path Documentation](auto-path.md) for more details.
- **File Metadata**: Each file can have arbitrary key-value metadata pairs associated with it.
- **Containment**: Each file is automatically injected into the RDF layer (Layer 3).  The file in Layer 3 follows the [LDP Basic Container](https://www.w3.org/TR/ldp/#ldp-basic-container) ideology allowing for easier interaction and data management of the RDF graph.  If the file is a JSON-LD file, the contents of the file are included in the RDF graph as well.
- **Custom Mime Types**: Each file can have a custom MIME type associated with it.  By default, CaskFS will attempt to infer the MIME type based on the file extension.
- **Hash-Based Writes**: You can optimistically write files by providing the SHA256 hash of the file content and file path.  If the SHA256 hash already exists in the CAS Layer (Layer 1), the write will succeed.  This is useful for various file layout patterns such as; weekly harvests where data is often unchanged, or large binary files moving between stage and production directories.  Finally, this mechanism can be used to efficiently sync files between CaskFS instances.

## File System CLI Methods

### Write

Write is the basic method for adding or updating a file in CaskFS.

CLI: `cask write <file-path> [options]`

### Copy

Copy entire directories from a the local filesystem into CaskFS, or from one path in CaskFS to another.  This is a recursive operation and will always overwrite files in the destination path.

CLI: `cask copy <source-path> <destination-path> [options]`

### Read
Read is the basic method for reading a file from CaskFS.

CLI: `cask read <file-path> [options]`

### List
List is the basic method for listing files and directories in CaskFS.

CLI: `cask ls <directory-path> [options]`

### Delete
Delete is the basic method for deleting a file from CaskFS.

CLI: `cask rm <file-path> [options]`
