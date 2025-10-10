# RDF - Layer 3 - Rest API

Overview:
 - [File Search: /cask/find](#file-search-caskfind)
 - [Relationship Search: /cask/rel](#relationship-search-caskrel)
 - [Fetch Linked Data: /cask/rdf](#fetch-linked-data-caskrdf)

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