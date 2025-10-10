# File System Layer 2 ( `fs` )

The file system layer is the main layer of user interaction with CaskFS. It provides a filesystem-like interface for users to interact with the underlying [content-addressable storage (CAS Layer 1)](cas.md) system. This layer is responsible for handling file operations such as reading, writing, deleting, and listing files and directories.

## Key Features

- **Filesystem Interface**: Provides a familiar filesystem interface for users to interact with files and directories.
- **Role-Based Access Control**: Implements role-based access control to manage permissions for different users at the directory level.
- **Virtual Directories**: Like cloud storage systems, CaskFS directories are virtual and do not exist as physical entities in the storage backend.  This allows for concepts like empty directories and directories with the same name as files or files nested within files.  This allows for easy syncing between your existing cloud storage and CaskFS.
- **Partition Key**: Each file can be associated with one or more partition keys, which can be used to group related files together. This is is most useful when interfacting with CaskFS via the [RDF Later (Layer 3)](rdf.md) as all queries are scoped to a specific partition key.
- **Auto Partition Key**: Each file can be automatically assigned a partition key based on the directory it is created in.  You can specify rules for how partition keys are assigned based on directory paths. 
- **File Metadata**: Each file can have arbitrary key-value metadata pairs associated with it.
- **Containment**: Each file is automatically injected into the RDF layer (Layer 3).  The file in Layer 3 follows the [LDP Basic Container](https://www.w3.org/TR/ldp/#ldp-basic-container) ideology allowing for easier interaction and data management of the RDF graph.  If the file is a JSON-LD file, the contents of the file are included in the RDF graph.
- **Custom Mime Types**: Each file can have a custom MIME type associated with it.  By default, CaskFS will attempt to infer the MIME type based on the file extension.
- **Hash-Based Writes**: You can optimistically write files by providing the SHA256 hash of the file content and file path.  If the SHA256 hash already exists in the CAS Layer (Layer 1), the write will succeed.  This is very useful for various file layout patterns such as; weekly harvests where data is often unchanged, or large binary files moving between stage and production directories.  Finally, this mechanism can be used to efficiently sync files between CaskFS instances.

## File System Methods

### Write

Write is the basic method for adding or updating a file in CaskFS.

CLI: `cask write <file-path> [options]`

API:

- POST /cask/fs/{path+}
  
   - Parameters:
     - path (string, required): The path where the file will be created.
  - Query Parameters:
     - partition-keys (string, optional): Comma-separated list of partition keys to associate with the file.
     - jsonld (boolean, optional): If true, will treat the request body as JSON-LD file.  You can also set the `Content-Type` header to `application/ld+json`.
     - bucket (string, optional): The bucket to associate with the file.  Cloud storage only.
     - metadata (string, optional): JSON string containing additional metadata to associate with the file.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
     - Content-Type (string): Set the mime type of the file to be created. Will default to using the extension of the file in the `path` parameter if not provided.
   - Body:
     - Contents of the file to be created
   - Responses:
     - 201 Created: The file was successfully created.
     - 400 Bad Request: Invalid parameters or request body.
     - 409 Conflict: A file already exists at the specified path.

- PUT /cask/fs/{path+}

   - Description: Insert OR update an existing file at the specified path.  Everything about this endpoint is the same as the POST endpoint, except that it will overwrite an existing file if one exists at the specified path where POST would return a 409 Conflict.