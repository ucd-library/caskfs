# File System - Layer 2 - REST API

[Back to File System Overview](./fs.md)

Overview:
 - [Filesystem Operations: /cask/fs](#filesystem-operations-caskfs)
   - [Get File Contents or File Metadata](#get-file-contents-or-file-metadata)
   - [Create a New File](#create-a-new-file)
   - [Create or Update a File](#create-or-update-a-file)
   - [Update a File Metadata](#update-a-file-metadata)
   - [Delete a File](#delete-a-file)
 - [Directory Operations: /cask/dir](#directory-operations-caskdir)
   - [List Directory](#list-directory)
   - [Create/Update Directory ACL](#createupdate-directory-acl)
 - [Optimistic Sync](#optimistic-sync)

# Filesystem Operations: /cask/fs

## Get File Contents or File Metadata
- GET /cask/fs/{path+}

   - Description: Retrieve metadata about a file at the specified path.
   - Parameters:
     - path (string, required): The path to the file.
   - Query Parameters:
     - metadata (boolean, optional): Whether to respond with the JSON metadata for the file.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
     - Accept (string, optional): `application/vnd.caskfs.file-metadata+json` to request metadata response. Alternative to using the `metadata` query parameter.  
   - Responses:
     - 200 OK: Returns metadata about the file.
     - 404 Not Found: The specified path does not exist.

## Create a New File
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

## Create or Update a File
- PUT /cask/fs/{path+}

   - Description: Insert OR update an existing file at the specified path.  Everything about this endpoint is the same as the POST endpoint, except that it will overwrite an existing file if one exists at the specified path where POST would return a 409 Conflict.

## Update a File Metadata
- PATCH /cask/fs/{path+}

   - Description: Update metadata for an existing file at the specified path.
   - Parameters:
     - path (string, required): The path to the file.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Body:
     - JSON object containing the metadata fields to update.
     - partitionKeys (array, optional): Array of partition keys to associate with the file.
     - metadata (object, optional): Object containing additional key/value metadata to associate with the file.
   - Responses:
     - 200 OK: The metadata was successfully updated.
     - 400 Bad Request: Invalid parameters or request body.
     - 404 Not Found: The specified path does not exist.

## Delete a File
- DELETE /cask/fs/{path+}
    - Description: Delete a file at the specified path.
    - Parameters:
      - path (string, required): The path to the file.
    - Headers:
      - Authorization (string, required): Bearer token for authentication.
    - Responses:
      - 200 OK: The file was successfully deleted.
      - 404 Not Found: The specified path does not exist.

# Directory Operations: /cask/dir

## List Directory
- GET /cask/dir/{path+}

   - Description: List the contents of a directory at the specified path.
   - Parameters:
     - path (string, required): The path to the directory.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Responses:
     - 200 OK: Returns a list of files and directories within the specified directory.
     - 404 Not Found: The specified path does not exist or is not a directory.

## Create/Update Directory ACL
- PUT /cask/dir/{path+}

   - Description: Create or update the ACL for a directory at the specified path.
   - Parameters:
     - path (string, required): The path where the directory will be created.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
    - Body:
      - JSON object containing the ACL fields to set.
   - Responses:
     - 201 Created: The directory was successfully created.
     - 400 Bad Request: Invalid parameters.
     - 409 Conflict: A file or directory already exists at the specified path.

## Optimistic Sync

This is a root endpoint that allows for syncing a batch of files to the filesystem.  This is an optimistic operation that will attempt to write all files in the batch, and will return information about which files were successfully written, which files failed, and which files did not exist in the CAS.  It's up to the client to determine how to handle failures and new insertions.

- POST /cask/sync

  - Description: Sync a batch of files to the filesystem.  This is an optimistic operation that will attempt to write all files in the batch, and will return information about which files were successfully written, which files failed, and which files did not exist in the CAS.
  - Parameters:
    - replace (boolean, optional): If true, will replace existing files.  Default is false.
  - Headers:
    - Authorization (string, required): Bearer token for authentication.
  - Body:
    - JSON object containing objects with the following fields:
      - filePath (string, required): The path to the file to sync.
      - hash (string, required): The content sha256 hash of the file to sync.
      - mimeType (string, optional): The mime type of the file to sync.
      - metadata (object, optional): Additional metadata to associate with the file.
      - partitionKeys (array, optional): Array of partition keys to associate with the file.
      - bucket (string, optional): The bucket to associate with the file.  Cloud storage only.
  - Responses:
    - 200 OK: The files were successfully synced.  This response will contain three arrays:
      - success: Array of file paths that were successfully written.
      - errors: Array of objects containing file paths and error messages for files that failed to write.
      - doesNotExist: Array of file paths that did not exist in the CAS.
    - 400 Bad Request: Invalid parameters or request body.