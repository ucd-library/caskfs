# CASK-FS
<b>C</b>ontent-<b>A</b>ddressed <b>S</b>torage with <b>K</b>nowledge graph - <b>F</b>ile <b>S</b>ystem.


# Quick Start - Local Development

- Checkout this repo
- Start the dev pg server: `./devops/start-dev.sh`
- Init the database: `./devops/cli.sh init-pg`
- Start using CASKFS: `./devops/cli.sh help`

Notes.  The `./devops/cli.sh` script sets the `CASKFS_ROOT_DIR` to the `cache` directory in the repo.  This is where all CASKFS data will be stored.  You can change this by setting the `CASKFS_ROOT_DIR` environment variable to another path.  Additonally the `cli.sh` sets the connection to the local dev pg server and the `caskfs_db` database.  


# General Concepts

## Layers

```
+-----------------------------+
|      Layer 3: RDF Graph     |
|  (Linked Data, JSON-LD,     | <-- Provides links between files
|   references, relationships)|
+-------------^---------------+
              |
+-------------|---------------+
| Layer 2: Filesystem Layer   |
| (Hierarchical files/dirs,   | <-- User interacts here
|  binary & JSON-LD metadata) |
+-------------^---------------+
              |
+-------------|---------------+
| Layer 1: CAS Storage Layer  |
| (SHA256-addressed files,    |
|  CAS metadata)              |
+-----------------------------+
```

There are three graph layers:
  1. The content-addressed storage layer (CAS) which stores all files by their SHA256 hash.  Additionally a metadata file is stored for each file in CAS, which contains a copy of all additional data stored about the file in the database.
  2. The filesystem layer which provides a filesystem-like hierarchy of files and directories, where files can be either binary files in or JSON-LD metadata files.
  3. The RDF layer which represents all linked data from the JSON-LD files and allows for linking (referencing) RDF and binary files.


## Interacting with CASKFS

Everything is done via layer 2, the filesystem layer.  The CAS layer is not directly interacted with.  The RDF layer is interacted with via the contents of JSON-LD files in the filesystem layer.


## Reference Binary File

There are three ways to reference a binary file to add linked data to it:

Direct reference to file in CASKFS:

```json
{
  "@id": "cask://path/to/file.jpg",
  "http://schema.org/description": "An image file"
}
```

A relative reference to a file in CASKFS:
```json
{
  "@id": "cask:/../file.jpg",
  "http://schema.org/description": "An image file, up one directory for metadata file"
}
```

Reference via extention.  Given a file `file.jpg`, the RDF can be stored in `file.jpg.jsonld.json` in the same directory.  Set leave the `@id` the the empty `cask:/` path.

```json
{
  "@id": "cask:/",
  "http://schema.org/description": "An image file"
}
```

How this works.  All binary files will create node in the RDF layer (layer 3) which will look like the following:

```json
{
  "@id": "cask:/file",
  "@graph": [
    {
      "@id": "cask://path/to/file.jpg",
      "@type": [
        "http://library.ucdavis.edu/cask#File",
        "http://library.ucdavis.edu/cask#Containment"
      ],
      "http://schema.org/contentUrl": "file:///path/to/file.jpg"
    }
  ]
}
```

The `contentUrl` of the graph is the path to the file in the filesystem layer (layer 2).  The `@id` of the node in the graph is the `cask://` URI of the binary file in the RDF layer (layer 3). 

When a request is made to the layer 3 RDF layer for the `cask://path/to/file.jpg` URI of the binary file,  JSON-LD file data is merged with the binary file RDF and returned providing a single view of all data about the binary file

This allows for any metadata file to reference a binary file and add additional linked data to it.

## File Relationships

One of the main features of CASK-FS is the ability to create relationships between files.  This is done by referencing having a subject or object in a file reference the subject or object of a triple in another file.

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
      "http://library.ucdavis.edu/cask#containment": {
          "@id": "file:///path/to/image/1.png"
      },
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

a link request for `/path/to/file1` will return the following:

```json
{
  "source": {
    "assetId": "7d993d89-1259-46c7-bc3b-bd963265ab60",
    "filepath": "/path/to/file1",
    "resourceType": "rdf"
  },
  "outbound": [{
    "file_id": "a99eb3d0-5b9e-4ae8-9176-42276ba2ab8d",
    "containment": "/path/to/file2",
    "source_subject": "https://library.ucdavis.edu/app/person/1",
    "predicate": "http://example.org/worksWith",
    "target_object": "https://library.ucdavis.edu/app/person/2"
  },{
    "file_id": "7d993d89-1259-46c7-bc3b-bd963265ab60",
    "containment": "/path/to/image/1.png",
    "source_subject": "https://library.ucdavis.edu/app/person/1",
    "predicate": "http://schema.org/image",
    "target_object": "cask://path/to/image/1.png"
  }],
  "inbound": []
}
```

# Requesting files

There are three main ways to request and view files in CASKFS, all of which are done via layer 2, the filesystem layer:
  - Direct layer 2 filesystem path request, returning the file as it was stored in layer 1 CAS.
  - JSON-LD layer 3 request for a layer 2 filesystem path, returning either:
    - The JSON-LD metadata from the file if it is a JSON-LD file
    - A merged view of the binary file cask Linked Data node and any JSON-LD subjects referencing the the cask node.
  - A link request representing all files (containments) who are linked in layer 3. This request shows all triples and their containments where:
    - A subject exists in the requested layer 3 graph for the requested layer 2 filesystem path and the object exists in a different layer 2 filesystem path. This is an `outgoing` link.
    - A object exists in the requested layer 3 graph for the requested layer 2 filesystem path and the subject for the triple exists in a different layer 2 filesystem path. This is an `incoming` link.

Additionally you can request for the cask metadata for any file in layer 2, or list (ls)
all files in a directory.