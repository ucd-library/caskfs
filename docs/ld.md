# Linked Data - Layer 3 ( `rdf` ) 

[Back to Overview](../README.md)

The RDF layer is the top layer of CaskFS. This layer is responsible for handling RDF data operations such as querying the linked data graph by subject or file, finding relationships between files, and retrieving RDF data.

Contents:
- [Key Features](#key-features)
- [Linked Data - Rest API](ld-rest-api.md)
- [Linked Data - CLI Methods](#linked-data-cli-methods)
- [Reference Binary File](#reference-binary-file)
- [File Relationships](#file-relationships)
- [Linked Data Harvesting Configuration](#linked-data-harvesting-configuration)

## Key Features

- **Layer 2 File System Graph**: Represents all files in the [Layer 2 File System](fs.md) as RDF nodes, allowing for rich metadata and relationships to be expressed via the `cask://` URI scheme.
- **Linked Data**: Supports reading and parsing JSON-LD and n3 files.  Along with the the [Layer 2 File System](fs.md) node, all triples (or quads) in the JSON-LD or n3 file are included in Layer 3 queries.
- **Binary File Metadata**: Allows for adding metadata to binary files by referencing binary files subjects from JSON-LD files.  See the [Reference Binary File](#reference-binary-file) section below for more details.
- **File Relationships**: Allows querying for relationships between files based on RDF triples that reference URI subjects or objects in other files.  You can then filter by; subject, predicate, partition keys or graph. See the [File Relationships](#file-relationships) section below for more details.
- **File Search**: Allows querying the layer 3 graph to find files.  You can find files that contain a; subject, predicate, object (URI not literal), partition keys or graph.

## Linked Data CLI Methods

### Find
Find is the main method for querying the RDF graph in CaskFS.

CLI: `cask find [options]`

### Relationship
Relationship is the main method for querying relationships between files in CaskFS.

CLI: `cask rel [options]`

### RDF
RDF is the main method for fetching RDF data from a file in CaskFS.

CLI: `cask rdf [options]`

### Harvest Test
Harvest Test checks a single URI against the [Linked Data Harvesting Configuration](#linked-data-harvesting-configuration) and reports which mechanisms -- literal, filter, link -- would harvest it, and which specific exact-match or regex entry matched. It's a pure config check (no database access), useful for verifying an allowlist/regex is set up the way you expect before writing files that depend on it.

CLI: `cask harvest-test <uri>` (works in both direct-pg and http mode; http mode requires admin access)

# Reference Binary File

Every file in the [Layer 2 File System](fs.md) is represented as a node in the RDF graph (Layer 3).  This includes both JSON-LD files and binary/non-RDF files.  The files are place in the `cask://file` graph and given an id of `cask://path/to/file`.  CaskFS provides helpers to allow JSON-LD files to reference binary/non-RDF files without needing to reference via full `cask://path/to/file` URIs.

There are three ways to reference a binary file to add linked data to it:

`Full Path Reference` to file in CaskFS:

```json
{
  "@id": "cask://path/to/file.jpg",
  "http://schema.org/description": "An image file"
}
```

`Relative Path Reference` to a file in CaskFS:
```json
{
  "@id": "cask:/../file.jpg",
  "http://schema.org/description": "An image file, up one directory for metadata file"
}
```

`Reference via extention` to a file in CaskFS.  Given a file `file.jpg`, the metadata can be stored in `file.jpg.jsonld.json` by leaving the `id` set to the empty `cask:/` path.  Both `file.jpg` and `file.jpg.jsonld.json` must be in the same directory.

```json
{
  "@id": "cask:/",
  "http://schema.org/description": "An image file"
}
```

How it works.  All binary files will create node in the RDF layer (layer 3) which will look like the following:

```json
[
  {
    "@graph": [
      {
        "@id": "cask://path/to/file.jpg",
        "@type": [
          "http://library.ucdavis.edu/cask#Containment",
          "http://library.ucdavis.edu/cask#File"
        ],
        "http://purl.org/dc/terms/created": [
          {"@value": "2025-10-10T14:55:22.565Z"}
        ],
        "http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#filename": [
          {"@value": "file.jpg"}
        ],
        "http://www.loc.gov/premis/rdf/v1#hasMessageDigest": [
          {"@value": "urn:md5:8b42595ae025ede38a3cd5cdda892ff5"},
          {"@value": "urn:sha-256:b3949928361af56ab1e183b258430c005a90991f9d8efbcdfcf0575042895af6"}
        ],
        "http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#hasMimeType": [
          {"@value": "image/jpeg"}
        ],
        "http://www.loc.gov/premis/rdf/v1#hasSize": [
          {"@value": "475133"}
        ],
        "http://schema.org/contentUrl": [
          {"@id": "file:///path/to/file.jpg"}
        ],
        "http://purl.org/dc/terms/modified": [
          {"@value": "2025-10-10T14:55:22.565Z"}
        ]
      }
    ],
    "@id": "cask:/file"
  }
]
```

The `contentUrl` of the graph is the path to the file in the filesystem layer (layer 2).  The `@id` of the node in the graph is the `cask://` URI of the binary file in the RDF layer (layer 3). 

When a request is made to the layer 3 RDF layer for the `cask://path/to/file.jpg` URI of the binary file,  JSON-LD file data is merged with the binary file RDF on the `cask://path/to/file.jpg` subject.

This allows for any metadata file to reference a binary file and add additional linked data to it.

# File Relationships

CaskFS provides the ability to query for relationships between files.  This is done by referencing having a subject or object in one file reference the subject or object of a different file.

Example:

Write: `/path/to/file1`
```json
{
  "@id": "https://library.ucdavis.edu/app/person/1",
  "@type": "http://schema.org/Person",
  "http://schema.org/name": "Justin Merz",
  "http://schema.org/description": "A person",
  "http://schema.org/image": { "@id": "cask://path/to/image/1.png" },
  "http://example.org/worksWith": { "@id": "https://library.ucdavis.edu/app/person/2" }
}
```

Write: `/path/to/image/1.png`
Generates the following cask node:

```json
{
  "@id": "cask:/file",
  "@graph": [{
      "@id": "cask://path/to/image/1.png",
      "@type": "http://library.ucdavis.edu/cask#File",
      "http://schema.org/contentUrl": {
        "@id": "file:///path/to/image/1.png"
      }
  }]
}
```

`/path/to/file2`

```json
{
  "@id": "https://library.ucdavis.edu/app/person/2",
  "@type": "http://schema.org/Person",
  "http://schema.org/name": "Dusty Cartwright",
  "http://schema.org/description": "A person",
}
```

a relationship request for `/path/to/file1` will return the following:

```json
{
  "source": {
    "file": "/path/to/file1",
    "resourceType": "rdf",
    "mimeType": "application/ld+json",
    "partitionKeys": []
  },
  "outbound": {
    "http://example.org/worksWith" : [
      "/path/to/file2"
    ],
    "http://schema.org/image": [
      "/path/to/image/1.png"
    ]
  },
  "inbound": {}
}
```

# Linked Data Harvesting Configuration

Not every URI or literal in an RDF file is useful to index — a large graph can carry thousands of
incidental triples that would otherwise bloat the search and relationship tables. CaskFS lets you opt
specific predicates or URIs into three independent harvesting behaviors. Each is controlled by a pair
of settings: an exact-match list and a regex-match list. A triple is harvested by a given mechanism if
it matches *either* list; anything that matches neither is silently skipped.

All matching happens against fully-expanded, absolute URIs — never against a compact term, prefix, or
CURIE from the source document's `@context`. JSON-LD expansion resolves those before CaskFS ever sees
the triple. The one CaskFS-specific exception is the `cask:/` shorthand described in
[Reference Binary File](#reference-binary-file) (e.g. `cask:/../file.jpg`) — subject, object, and graph
URIs written that way are resolved to their full `cask://path/to/file` form before matching, so allowlist
entries for those should use the full resolved form, not the shorthand as it appears in the source file.

## Literal Harvesting

Controls which predicates get their literal (text) value stored for retrieval via `literal()`.

- `CASKFS_LITERAL_PREDICATES` — comma-separated list of exact predicate URIs.
- `CASKFS_LITERAL_PREDICATE_MATCHES` — comma-separated list of regex patterns tested against the predicate URI.
- Default: `http://schema.org/name`.

## Filter Harvesting

Controls which URIs become searchable via `find()` — this covers `rdf:type` values, subjects, predicates,
objects, and graph URIs alike. A URI must match the allowlist to be written to `file_ld_filter`;
everything else is ignored for search purposes (it's still present in the underlying RDF, it's just not
a queryable facet).

- `CASKFS_FILTER_URIS` — comma-separated list of exact URIs.
- `CASKFS_FILTER_URI_MATCHES` — comma-separated list of regex patterns.
- Default: none. Filter harvesting is opt-in — set at least one of these if you want `find()` to return
  anything.

Example: to make `schema.org` types and your own app's entity subjects searchable:
```
CASKFS_FILTER_URI_MATCHES=^http://schema\.org/,^https://library\.ucdavis\.edu/app/
```

## Link Harvesting

Controls which predicate/object pairs become inter-file links, used by `relationships()` to compute
inbound/outbound edges between files. The match is checked against the **predicate** URI only — if a
predicate is opted in, every NamedNode object it points to becomes a link.

- `CASKFS_LINK_PREDICATES` — comma-separated list of exact predicate URIs.
- `CASKFS_LINK_PREDICATE_MATCHES` — comma-separated list of regex patterns.
- Default: none. Link harvesting is opt-in — set at least one of these if you want `relationships()` to
  return anything.

Example: to track `schema:image` and any custom `worksWith`-style relation:
```
CASKFS_LINK_PREDICATES=http://schema.org/image
CASKFS_LINK_PREDICATE_MATCHES=worksWith$
```

> **Upgrade note:** prior to this feature, all types/subjects/predicates/objects/graphs were filterable
> and every predicate/object link was harvested unconditionally. Filter and link harvesting are now
> opt-in — existing deployments that rely on `find()` or `relationships()` need to set the env vars
> above after upgrading, or those queries will start returning empty results.

## Testing Your Configuration

Given how easy it is for a regex or exact-match entry to silently miss (a case mismatch, an
un-expanded prefix, an un-resolved `cask:/` shorthand), CaskFS provides a diagnostic tool: `cask
harvest-test <uri>` (or `GET /cask/harvest-test?uri=...` over HTTP, admin-only — see
[ld-rest-api.md](ld-rest-api.md)) reports which of the three mechanisms above would harvest a given
URI, and which specific exact entry or regex pattern matched:

```bash
$ cask harvest-test http://schema.org/name
{
  "uri": "http://schema.org/name",
  "literal": { "matches": true, "matchedBy": "exact", "pattern": "http://schema.org/name" },
  "filter": { "matches": false, "matchedBy": null, "pattern": null },
  "link": { "matches": false, "matchedBy": null, "pattern": null }
}
```
