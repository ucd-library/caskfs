# API Specification

# Filesystem Operations: /cask/fs

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

- POST /cask/fs/{path+}
  
   - Description: Create a new file at the specified path.
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

- GET /cask/dir/{path+}

   - Description: List the contents of a directory at the specified path.
   - Parameters:
     - path (string, required): The path to the directory.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Responses:
     - 200 OK: Returns a list of files and directories within the specified directory.
     - 404 Not Found: The specified path does not exist or is not a directory.

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

# File Search: /cask/find

- GET /cask/find

   - Description: Search for files in the filesystem.
   - Query Parameters:
     - subject (string, optional): Find RDF files who contain this subject.
     - predicate (string, required): Find RDF files who contain this predicate.
     - object (string, optional): Find RDF files who contain this object.
     - graph (string, optional): Find RDF files who contain this graph.
     - partitionKeys (string, optional): Comma-separated list of partition keys to filter the search.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Responses:
     - 200 OK: Returns a list of files matching the search query.
     - 400 Bad Request: Invalid parameters.

- POST /cask/find

   - Description: Same as GET /cask/find but allows for a larger query in the request body.

# Relationship Search: /cask/rel

- GET /cask/rel

   - Description: Search for relationships in RDF files.
   - Query Parameters:
     - subject (string, optional): Only include links with the specified subject URI.
     - predicate (string, required): Only include links with the specified predicate, comma-separated list.
     - ignorePredicate (string, optional): Comma-separated list of predicates to ignore.
     - graph (string, optional): Only include links in the specified graph.
     - partitionKeys (string, optional): Comma-separated list of partition keys to filter the search.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Responses:
     - 200 OK: Returns a list of relationships matching the search query.
     - 400 Bad Request: Invalid parameters.

- POST /cask/rel

   - Description: Same as GET /cask/rel but allows for a larger query in the request body.

# Fetch Linked Data: /cask/rdf

- GET /cask/rdf

   - Description: Fetch and return RDF data from a given URL.  Either containment or subject parameter is required.
   - Query Parameters:
     - containment (string, required): The filepath or URL to fetch RDF data from.
     - subject (string, optional): Filter results to include only triples with this subject URI.
     - object (string, optional): Filter results to include only triples with this object URI.
     - graph (string, optional): Filter results to include only triples in this graph.
     - partitionKeys (string, optional): Comma-separated list of partition keys to filter the search.  Mostly used when the subject parameter is used to filter which files (Containments) in the CaskFS filesystem are searched for the subject.
     - format (string, optional): Desired RDF serialization format. Alternative to providing `accept` header.  One of:
       - jsonld (default)
       - compacted
       - expanded
       - flattened
       - cask
       - nquads
       - json
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
     - Accept (string, optional): Desired RDF serialization format
      - application/ld+json
      - application/ld+json; profile="http://www.w3.org/ns/json-ld#compacted"
      - application/ld+json; profile="http://www.w3.org/ns/json-ld#expanded"
      - application/ld+json; profile="http://www.w3.org/ns/json-ld#flattened"
      - application/ld+json; profile="http://library.ucdavis.edu/cask#compacted"
      - application/n-quads
      - application/json
   - Responses:
     - 200 OK: Returns the fetched RDF data in the requested format.
     - 400 Bad Request: Invalid parameters.
     - 404 Not Found: The specified URL could not be reached or does not contain RDF data.