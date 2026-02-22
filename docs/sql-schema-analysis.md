# SQL Schema Analysis Report for CASKFS

**Date:** November 1, 2025  
**Database System:** PostgreSQL  
**Schema Name:** `caskfs`

## Executive Summary

The CASKFS database schema implements a sophisticated three-layer architecture for content-addressed storage with linked data capabilities. The schema consists of 4 main SQL files that create a comprehensive data model with 23 tables, 15 views, and several stored functions supporting file system operations, access control, and RDF/linked data management.

## Schema Architecture Overview

The database is organized into four distinct layers:

1. **Configuration Layer** (`config.sql`)
2. **Layer 1: Content-Addressed Storage (CAS)** (`layer1-cas.sql`)
3. **Layer 2: File System with ACL** (`layer2-fs.sql`)
4. **Layer 3: Linked Data (RDF)** (`layer3-ld.sql`)

---

## Detailed Analysis by Layer

### Configuration Layer (`config.sql`)

**Purpose:** Stores system configuration and path partition rules.

#### Tables

1. **`config`**
   - Stores key-value configuration pairs
   - Fields: `config_id` (UUID PK), `name` (unique), `value`
   - Use case: System-wide configuration settings

2. **`auto_path_partition`**
   - Defines automatic path-based partitioning rules
   - Fields: `auto_path_partition_id` (UUID PK), `name` (unique), `index`, `filter_regex`, `get_value`
   - Use case: Automatic organization of files based on path patterns

3. **`auto_path_bucket`**
   - Defines automatic bucket assignment rules
   - Fields: `auto_path_bucket_id` (UUID PK), `name` (unique), `index`, `filter_regex`, `get_value`
   - Use case: Cloud storage bucket management

**Key Characteristics:**
- Simple configuration management
- Regex-based pattern matching for automation
- Support for multi-cloud storage strategies

---

### Layer 1: Content-Addressed Storage (`layer1-cas.sql`)

**Purpose:** Implements content-addressed storage using SHA256 hashing.

#### Tables

1. **`hash`**
   - Central table for content-addressed storage
   - Fields:
     - `hash_id` (UUID PK)
     - `value` (VARCHAR(256), UNIQUE) - SHA256 hash
     - `digests` (JSONB) - Additional hash digests
     - `bucket` (VARCHAR(256)) - Storage bucket location
     - `size` (BIGINT) - File size in bytes
     - `created` (TIMESTAMPTZ)
     - `nquads` (TEXT) - RDF N-Quads data
   - Indexed on: `value`

**Key Characteristics:**
- Deduplication through hash-based storage
- Single source of truth for file content
- Supports multiple storage backends (via bucket field)
- Stores both binary and linked data metadata

**Design Pattern:** Content-addressed storage ensures that identical files are stored only once, with multiple file system entries referencing the same hash.

---

### Layer 2: File System with ACL (`layer2-fs.sql`)

**Purpose:** Provides hierarchical file system with role-based access control.

#### Core Entities

##### Directory Management

1. **`directory`**
   - Hierarchical directory structure
   - Fields:
     - `directory_id` (UUID PK)
     - `fullname` (VARCHAR(256), UNIQUE) - Full path
     - `name` (GENERATED COLUMN) - Directory name without trailing slash
     - `parent_id` (UUID FK to directory)
     - `created`, `modified` (TIMESTAMPTZ)
   - Indexes: `name`, `parent_id`
   - Special: Root directory '/' is auto-created

##### File Management

2. **`file`**
   - File entries in the file system
   - Fields:
     - `file_id` (UUID PK)
     - `name` (VARCHAR(256))
     - `directory_id` (UUID FK to directory)
     - `hash_id` (UUID FK to hash)
     - `metadata` (JSONB)
     - `last_modified_by` (TEXT)
     - `created`, `modified` (TIMESTAMPTZ)
     - `nquads` (TEXT) - CASK-specific RDF data
   - Unique constraint: (`directory_id`, `name`)
   - Indexes: `hash_id`, `directory_id`, `name`, composite `(directory_id, name)`

##### Partition Keys

3. **`partition_key`**
   - Partition key definitions
   - Fields: `partition_key_id`, `value` (unique), `auto_path_partition_id` (FK), `created`
   
4. **`file_partition_key`**
   - Many-to-many relationship between files and partition keys
   - Fields: `file_partition_key_id`, `file_id` (FK), `partition_key_id` (FK)
   - Unique constraint: (`file_id`, `partition_key_id`)

#### Access Control Layer

##### User and Role Management

5. **`acl_user`**
   - User accounts
   - Fields: `user_id` (UUID PK), `name` (unique), `created`
   - Index: `name`

6. **`acl_role`**
   - Role definitions
   - Fields: `role_id` (UUID PK), `name` (unique), `created`
   - Index: `name`

7. **`acl_role_user`**
   - User-role assignments with optional expiration
   - Fields: `acl_role_user_id`, `role_id` (FK), `user_id` (FK), `created`, `modified`, `expires`
   - Unique constraint: (`role_id`, `user_id`)
   - Index: composite `(role_id, user_id)`

##### Directory-Level ACL

8. **`root_directory_acl`**
   - ACL configuration for root directories
   - Fields: `root_directory_acl_id`, `directory_id` (FK, unique), `public` (boolean), `modified`
   - Index: `directory_id`

9. **`directory_acl`**
   - Links directories to their ACL roots (inheritance model)
   - Fields: `directory_acl_id`, `directory_id` (FK, unique), `root_directory_acl_id` (FK), `modified`
   - Index: composite `(directory_id, root_directory_acl_id)`

10. **`acl_permission`**
    - Permission assignments to roles
    - Fields: `acl_permission_id`, `root_directory_acl_id` (FK), `permission` (ENUM: read/write/admin), `role_id` (FK), `created`, `modified`
    - Unique constraint: (`root_directory_acl_id`, `permission`, `role_id`)
    - Indexes: `role_id`, `root_directory_acl_id`, composite `(role_id, permission)`

**Permission Types:**
- `read` - Can read files
- `write` - Can read and write files
- `admin` - Full administrative access

#### Views

1. **`acl_user_roles_view`**
   - Shows all user-role relationships
   - Useful for: Permission debugging and user management

2. **`directory_user_permissions_lookup_by_permission`**
   - Base view for permission calculations
   - Includes public access logic
   - Handles permission inheritance

3. **`directory_user_permissions_lookup`** (MATERIALIZED VIEW)
   - Optimized lookup for user permissions by directory
   - Aggregates: `can_read`, `can_write`, `is_admin` (BOOL_OR aggregation)
   - Unique index: `(directory_id, user_id)`
   - Indexes: `directory_id`, `user_id`
   - **Performance Note:** Must be refreshed manually after ACL changes

4. **`directory_user_permissions_by_permission`**
   - Human-readable permission listing
   - Shows: directory name, user name, permissions, ACL root directory

5. **`directory_user_permissions`**
   - Aggregated user permissions by directory
   - Shows: directory, user, aggregated permissions

6. **`file_view`**
   - Comprehensive file information
   - Joins: file + hash + directory + partition keys
   - Fields: file_id, directory_id, directory, filename, filepath, hash_value, digests, metadata, partition_keys, timestamps, size, bucket

7. **`simple_file_view`**
   - Minimal file information for performance
   - Fields: file_id, filepath, metadata, timestamps, last_modified_by

8. **`file_partition_keys`**
   - Aggregated partition keys per file
   - Returns: `file_id`, `partition_keys` (array)

9. **`file_quads_view`**
   - File RDF/linked data view
   - Shows: filepath, metadata, hash, file_nquads (from hash), cask_nquads (from file)

10. **`unused_hashes`**
    - Identifies orphaned hashes (not referenced by any file)
    - Useful for: Garbage collection and cleanup operations

11. **`stats`**
    - System-wide statistics
    - Counts: total_hashes, unused_hashes, total_files, total_directories, total_file_partition_keys, total_acl_users, total_acl_roles

#### Stored Functions

1. **`get_directory_id(p_fullname)`**
   - Returns directory UUID by full path
   - Language: PL/pgSQL

2. **`insert_file(...)`**
   - Atomic file insertion with automatic hash management
   - Parameters: directory_id, hash_value, filename, last_modified_by, digests, size, metadata, bucket
   - Returns: file_id (UUID)
   - Logic: Upserts hash, then inserts file record
   - Language: PL/pgSQL

3. **`add_partition_key(...)`**
   - Adds partition key to file with auto-path partition support
   - Parameters: file_id, partition_key_value, auto_path_partition_name (optional)
   - Handles: Key creation, auto-path association, old key cleanup
   - Language: PL/pgSQL

4. **`update_modified_timestamp()`**
   - Trigger function to auto-update `modified` timestamp
   - Language: PL/pgSQL

#### Triggers

1. **`trigger_directory_acl_update_modified`**
   - ON UPDATE of `directory_acl` table

2. **`trigger_directory_update_modified`**
   - ON UPDATE of `directory` table

3. **`trigger_file_update_modified`**
   - ON UPDATE of `file` table

**Key Characteristics:**
- Hierarchical directory structure with path-based addressing
- Comprehensive role-based access control (RBAC)
- Permission inheritance through directory tree
- Public access support
- Materialized view for permission lookup performance
- Automatic timestamp management
- Partition key support for file organization
- Metadata stored as JSONB for flexibility

**Design Patterns:**
- **ACL Inheritance:** Directories inherit permissions from their root directory ACL
- **Materialized Views:** Performance optimization for permission lookups
- **Deduplication:** Multiple files can reference the same hash
- **Flexible Metadata:** JSONB allows arbitrary metadata without schema changes

---

### Layer 3: Linked Data / RDF (`layer3-ld.sql`)

**Purpose:** Implements RDF graph storage and querying capabilities.

#### Core Entities

1. **`uri`**
   - URI normalization and deduplication
   - Fields: `uri_id` (UUID PK), `uri` (VARCHAR(1028), UNIQUE)
   - Indexes: B-tree on `uri`, Hash index on `uri`
   - **Design Note:** Single source of truth for URIs, reduces storage

##### RDF Filtering

2. **`ld_filter`**
   - Filter definitions for RDF queries
   - Fields: `ld_filter_id` (UUID PK), `type` (ENUM), `uri_id` (FK)
   - Types: 'graph', 'subject', 'predicate', 'object', 'type'
   - Unique constraint: (`type`, `uri_id`)
   - Index: composite `(type, uri_id)`

3. **`file_ld_filter`**
   - Links files to RDF filters (enables fast filtering)
   - Fields: `file_ld_filter_id`, `file_id` (FK to file), `ld_filter_id` (FK)
   - Unique constraint: (`file_id`, `ld_filter_id`)
   - Indexes: `file_id`, `ld_filter_id`

##### RDF Links

4. **`ld_link`**
   - Stores predicate-object relationships
   - Fields: `ld_link_id` (UUID PK), `predicate` (UUID FK to uri), `object` (UUID FK to uri)
   - Unique constraint: (`predicate`, `object`)
   - Indexes: `predicate`, `object`

5. **`file_ld_link`**
   - Links files to RDF relationships
   - Fields: `file_ld_link_id`, `file_id` (FK to file), `ld_link_id` (FK)
   - Unique constraint: (`file_id`, `ld_link_id`)
   - Indexes: composite `(ld_link_id, file_id)`, `file_id`, `ld_link_id`

#### Views

1. **`file_ld_filter_view`**
   - Human-readable filter view
   - Shows: file_ld_filter_id, filepath, type, uri

2. **`file_ld_link_view`**
   - Human-readable link view
   - Shows: file_ld_link_id, filepath, predicate (URI), object (URI)

#### Stored Functions

1. **`upsert_uri(p_uri)`**
   - Inserts or returns existing URI ID
   - Handles race conditions with ON CONFLICT
   - Returns: uri_id (UUID)
   - Language: PL/pgSQL

2. **`get_uri_id(p_uri)`**
   - Fast URI lookup
   - Returns: uri_id (UUID)
   - Language: SQL
   - Attributes: STABLE, PARALLEL SAFE (optimization hints)

3. **`insert_file_ld(...)`**
   - Processes RDF N-Quads and types for a file
   - Parameters: file_id, nquads (JSONB), types (JSONB)
   - Logic:
     1. Inserts types into filter table
     2. Loops through N-Quads
     3. Upserts URIs for graph, subject, predicate, object
     4. Creates filter entries
     5. Creates link entries for named node objects
   - Language: PL/pgSQL

**Key Characteristics:**
- URI deduplication and normalization
- Dual indexing strategy (B-tree and hash) for URIs
- Separate storage of filters (for querying) and links (for relationships)
- Support for RDF N-Quads format (graph, subject, predicate, object)
- RDF type tracking
- Optimized for complex SPARQL-like queries

**Design Patterns:**
- **Normalization:** URIs stored once in `uri` table
- **Denormalization:** File-filter and file-link join tables for fast queries
- **Graph Query Support:** Links table enables traversal queries
- **Multi-faceted Filtering:** Separate filters for graph, subject, predicate, object, type

---

## Schema Relationships and Data Flow

### High-Level Entity Relationships

```
config.auto_path_partition
    ↓
partition_key ←→ file_partition_key ←→ file → hash (CAS Layer)
                                         ↓
                                    directory
                                         ↓
                                    directory_acl → root_directory_acl → acl_permission
                                                                               ↓
                                    acl_role ←→ acl_role_user ←→ acl_user

file → file_ld_filter → ld_filter → uri (RDF Layer)
    ↘ file_ld_link → ld_link → uri
```

### Data Flow

1. **File Ingestion:**
   - Hash computed → `hash` table (deduplicated)
   - File entry created → `file` table (references hash and directory)
   - Metadata stored in JSONB field
   - Partition keys assigned (optional)
   - RDF data extracted and stored in Layer 3

2. **Access Control:**
   - User assigned to roles → `acl_role_user`
   - Roles granted permissions on root directories → `acl_permission`
   - Directory ACLs inherit from root → `directory_acl`
   - Materialized view provides fast permission lookup

3. **Linked Data Processing:**
   - JSON-LD parsed into N-Quads
   - URIs extracted and normalized → `uri` table
   - Filters created for each RDF component → `ld_filter`, `file_ld_filter`
   - Relationships stored → `ld_link`, `file_ld_link`

---

## Performance Considerations

### Indexes

**Well-Indexed Areas:**
- Hash values (unique + indexed)
- Directory structure (parent_id, fullname)
- File lookups (directory + name composite index)
- URI lookups (B-tree + hash indexes)
- ACL permission lookups (role_id, permission composite)
- RDF filters (type, uri_id composite)
- RDF links (predicate, object)

### Materialized View

**`directory_user_permissions_lookup`:**
- **Purpose:** Fast permission checks
- **Trade-off:** Stale data vs. performance
- **Refresh Strategy:** Manual refresh required
- **Recommendation:** Implement automatic refresh triggers or scheduled jobs

### Query Optimization

**Efficient Operations:**
- File lookup by path (indexed)
- Hash-based file deduplication (unique constraint)
- User permission checks (materialized view)
- URI-based RDF queries (dual indexing)

**Potentially Expensive Operations:**
- Complex RDF graph traversals (multiple joins)
- Deep directory tree permission inheritance
- Finding all files with specific linked data properties (intersect queries)

---

## Schema Strengths

1. **Content Deduplication:** Hash-based storage eliminates duplicate content
2. **Flexible Metadata:** JSONB fields allow schema-less metadata
3. **Comprehensive ACL:** Role-based permissions with inheritance
4. **RDF Support:** Full linked data capabilities with efficient filtering
5. **Multi-Cloud Ready:** Bucket field supports various storage backends
6. **Audit Trail:** Created/modified timestamps on key tables
7. **Data Integrity:** Extensive foreign keys and unique constraints
8. **Query Performance:** Strategic indexes and materialized views
9. **Modular Design:** Clear separation between layers

---

## Potential Areas for Improvement

### 1. Materialized View Refresh Strategy

**Issue:** `directory_user_permissions_lookup` requires manual refresh.

**Recommendations:**
- Implement trigger-based automatic refresh on ACL changes
- Use `REFRESH MATERIALIZED VIEW CONCURRENTLY` to avoid locking
- Consider cron job for periodic refresh
- Monitor staleness and refresh frequency

### 2. Cascade Delete Behavior

**Current State:**
- `file_ld_filter` and `file_ld_link` have ON DELETE CASCADE
- `hash` table does not cascade to `file`

**Considerations:**
- Should deleting a file delete unused hashes? (Garbage collection)
- Should deleting a directory cascade to files?
- Document expected cascade behavior

**Recommendation:**
- Implement explicit garbage collection for unused hashes
- Consider soft deletes for audit purposes

### 3. Scalability Considerations

**Large Dataset Concerns:**
- RDF graph queries may become slow with millions of triples
- Consider partitioning `file` table by directory or date
- Monitor materialized view refresh time as ACL grows

**Recommendations:**
- Implement table partitioning for very large deployments
- Consider time-series partitioning for file table
- Add query monitoring and slow query logging

### 4. Missing Indexes

**Potential Additions:**
- `file.created` and `file.modified` for time-based queries
- `hash.created` for temporal analysis
- `hash.size` for size-based queries
- Partial indexes for specific query patterns

### 5. Foreign Key on `directory.parent_id`

**Current:** Self-referencing FK exists but may need constraints

**Recommendation:**
- Ensure root directory cannot be deleted
- Add CHECK constraint to prevent circular references (though self-referencing should handle this)

### 6. Backup and Recovery

**Considerations:**
- Materialized views need to be refreshed after restore
- Foreign key dependencies require specific restore order
- Large `hash` table may need special backup strategy

**Recommendations:**
- Document restore procedure
- Test backup/restore with materialized view refresh
- Consider logical vs. physical backups for different scenarios

### 7. Schema Versioning

**Current:** No version tracking in schema

**Recommendation:**
- Add schema version to `config` table
- Implement migration tracking system
- Document schema changes and migration path

### 8. Data Validation

**Missing Validations:**
- No CHECK constraint on hash format (should be valid SHA256)
- No validation on URI format
- No size limits on JSONB fields

**Recommendations:**
```sql
ALTER TABLE caskfs.hash ADD CONSTRAINT check_hash_format 
  CHECK (value ~ '^[a-f0-9]{64}$');

ALTER TABLE caskfs.uri ADD CONSTRAINT check_uri_format 
  CHECK (uri ~ '^[a-z][a-z0-9+.-]*:');
```

---

## Security Considerations

### Access Control

**Strengths:**
- Comprehensive RBAC system
- Directory-level granularity
- Public access flag for anonymous users
- Permission inheritance reduces configuration complexity

**Considerations:**
- Ensure materialized view is refreshed after permission changes
- Document public access implications
- Consider row-level security (RLS) for additional protection

### SQL Injection

**Current Mitigation:**
- Database client uses parameterized queries (`$1`, `$2`, etc.)
- Good practice observed in `index.js`

**Recommendations:**
- Continue using parameterized queries exclusively
- Avoid dynamic SQL construction where possible
- Document secure coding practices

### Data Privacy

**Considerations:**
- Metadata in JSONB may contain sensitive information
- RDF data may expose relationships
- Hash values allow fingerprinting of content

**Recommendations:**
- Document metadata privacy guidelines
- Consider field-level encryption for sensitive metadata
- Implement audit logging for access to sensitive files

---

## Integration Points

### Database Client (`src/lib/database/`)

**Initialization Order:**
1. `config.sql` - Base configuration
2. `layer1-cas.sql` - Content storage
3. `layer2-fs.sql` - File system (depends on hash table)
4. `layer3-ld.sql` - Linked data (depends on file table)

**Key Methods:**
- `init()` - Executes all schema files in order
- `insert_file()` - Uses stored function for atomic file creation
- `findFiles()` - Complex query builder for RDF/partition filtering
- `generateFileWithFilter()` - Dynamic SQL generation for filters
- `generateAclWithFilter()` - ACL-aware query generation

### Storage Backend

**Integration:**
- `hash.bucket` field indicates storage location
- Supports multiple buckets for multi-cloud strategy
- `auto_path_bucket` allows automatic bucket assignment

---

## Testing Recommendations

### Unit Tests

1. **ACL System:**
   - Test permission inheritance
   - Test public access
   - Test role expiration
   - Test materialized view refresh

2. **File System:**
   - Test directory hierarchy
   - Test file deduplication (same hash)
   - Test partition key assignment
   - Test metadata updates

3. **RDF Layer:**
   - Test URI normalization
   - Test filter creation
   - Test link traversal
   - Test complex queries

### Integration Tests

1. Test full file ingestion workflow
2. Test ACL enforcement at query time
3. Test RDF data extraction and storage
4. Test concurrent access and race conditions

### Performance Tests

1. Benchmark permission lookup with/without materialized view
2. Test RDF query performance with large datasets
3. Test file system traversal at scale
4. Measure materialized view refresh time

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **SQL Files** | 4 |
| **Tables** | 23 |
| **Views** | 11 |
| **Materialized Views** | 1 |
| **Stored Functions** | 7 |
| **Triggers** | 3 |
| **Enums** | 2 |
| **Indexes** | 40+ |
| **Foreign Keys** | 20+ |

---

## Conclusion

The CASKFS database schema is a well-designed, multi-layered system that effectively implements content-addressed storage with comprehensive access control and linked data capabilities. The schema demonstrates strong architectural principles including:

- Clear separation of concerns across layers
- Efficient data deduplication through content addressing
- Flexible metadata management with JSONB
- Comprehensive RBAC with directory-level granularity
- Advanced RDF graph storage and querying
- Performance optimization through strategic indexing

The main areas for enhancement include implementing automatic materialized view refresh, adding data validation constraints, improving garbage collection for unused hashes, and documenting operational procedures for backup/restore and schema migrations.

Overall, this is a production-ready schema that balances functionality, performance, and maintainability. The modular design allows for independent scaling and optimization of each layer as needed.

---

## Appendix: Table Dependencies

**Initialization Order (Critical):**
1. `config`, `auto_path_partition`, `auto_path_bucket` (no dependencies)
2. `hash` (no dependencies)
3. `acl_user`, `acl_role` (no dependencies)
4. `directory` (self-referencing)
5. `root_directory_acl` (depends on directory)
6. `directory_acl` (depends on directory, root_directory_acl)
7. `acl_role_user` (depends on acl_role, acl_user)
8. `acl_permission` (depends on root_directory_acl, acl_role)
9. `partition_key` (depends on auto_path_partition)
10. `file` (depends on directory, hash)
11. `file_partition_key` (depends on file, partition_key)
12. `uri` (no dependencies)
13. `ld_filter` (depends on uri)
14. `file_ld_filter` (depends on file, ld_filter)
15. `ld_link` (depends on uri)
16. `file_ld_link` (depends on file, ld_link)

This dependency graph ensures that all foreign key constraints are satisfied during schema creation and data loading.
