# Audit Log

[Back to File System Overview](./fs.md)

CaskFS can record an append-only audit trail of every mutating operation (writes, deletes,
moves, ACL changes, lineage edits, reharvests) - who did it, from where, and what changed.
It is **opt-in and disabled by default**; enabling it has no effect on any deployment that
doesn't explicitly turn it on.

Contents:
- [Enabling audit logging](#enabling-audit-logging)
- [What gets recorded](#what-gets-recorded)
- [No-op writes are not audited](#no-op-writes-are-not-audited)
- [Retention and rotation](#retention-and-rotation)
- [Managing archive files](#managing-archive-files)
- [Querying the audit log](#querying-the-audit-log)

## Enabling audit logging

Set `CASKFS_AUDIT_ENABLED=true`. When unset (or any other value), `logAudit()` short-circuits
before touching the database - the `audit_log` table and its Postgres functions are still
created on schema init either way (cheap, and it means turning this on later is just flipping
the flag, not running a migration).

| Env Var | Default | Description |
|---|---|---|
| `CASKFS_AUDIT_ENABLED` | `false` | Enable audit logging |
| `CASKFS_AUDIT_HOT_WINDOW_MONTHS` | `1` | How many months of audit rows to keep in Postgres before `cask audit rotate` exports and drops the partition |

Rotated archives are always written to `<rootDir>/audit` - not separately configurable -
mirroring the CAS layer's `<rootDir>/cas` convention (see [CAS docs](cas.md)), so the archive
location always travels with the CaskFS instance's own `rootDir`.

## What gets recorded

Each row records: `requestor`, `ip_address` (HTTP-originated operations only - always `null`
for CLI/internal-triggered work, which is expected, not an error), `operation` (a dotted name
like `file.write`, `file.move`, `acl.grant_role`), `resource_type`/`resource_id`/`resource_path`,
a `cork_trace_id`, and an operation-specific `details` JSON payload.

`cork_trace_id` correlates multi-step operations - e.g. a `moveFile()` call and the reharvest
it automatically triggers on RDF files share the same trace id, so the audit log shows the
reharvest as a consequence of the move rather than an unexplained, independent event.

`audit_log_id` is a strictly monotonic sequence, shared across every monthly partition (not a
UUID, and not per-partition `GENERATED ALWAYS AS IDENTITY`, which would silently give each
partition its own independent counter). This is what makes it usable as a future WAL-style
cursor for replicas to tail (`WHERE audit_log_id > :last_seen`) - not yet built, but the schema
is designed for it.

## No-op writes are not audited

`write()`'s hash-based dedup already distinguishes a real content/metadata change from a
rewrite that landed on identical content - only the former is audited. This roughly halves the
audit volume of a harvest job that gets re-run over unchanged content, and keeps the log
focused on actual state transitions rather than every attempt.

## Retention and rotation

`audit_log` is a native Postgres table partitioned by month. Rotation is not automatic - run it
on a schedule (cron, or a k8s `CronJob` alongside the rest of your CaskFS deployment):

```bash
cask audit rotate            # export + drop any partition older than the hot window
cask audit rotate --dry-run  # list what would be rotated, without touching anything
```

Each rotated partition is exported as one gzipped JSONL file
(`<rootDir>/audit/audit_log_YYYY_MM.jsonl.gz`) - one JSON object per line, so it stays directly
queryable later via `duckdb`, `jq`, or `pandas.read_json(lines=True)` without needing a schema.
The row count in the export is verified against the partition before it's dropped; a mismatch
aborts the rotation and leaves the partition untouched.

Once a partition is dropped, its data is no longer queryable from Postgres - "full history of
file X" queries spanning a rotated period need a separate pass over the archive files.

Rotation is a `CaskFs` method (`rotateAuditLog()`), not just a CLI script, so `cask audit
rotate` works the same way in both `direct-pg` and `http` environments (see
[CLI](../README.md#cli)) - over HTTP it calls `POST /audit/rotate`, and the *server* performs
the actual export/drop against its own `rootDir` and database. Global admin only.

## Managing archive files

Rotated archive files can be listed, downloaded, and deleted - as `CaskFs` methods, over the
REST API, and via the CLI. All of these are **global admin only** (`allowAdminAction()`), the
same gate used for role/user management.

```bash
cask audit list                                    # name, size, last-modified for each archive
cask audit get audit_log_2026_07.jsonl.gz           # downloads to ./audit_log_2026_07.jsonl.gz
cask audit get audit_log_2026_07.jsonl.gz -o out.gz # ...or to an explicit path
cask audit delete audit_log_2026_07.jsonl.gz        # permanently removes the file
```

| Method | REST endpoint | Description |
|---|---|---|
| `listAuditArchives()` | `GET /audit/archives` | List archive files: `{name, size, modified}` |
| `getAuditArchive({name})` | `GET /audit/archives/:name` | Raw gzipped bytes, as a stream |
| `deleteAuditArchive({name})` | `DELETE /audit/archives/:name` | Permanently delete one archive file |

`name` must match `audit_log_YYYY_MM.jsonl.gz` exactly - this also rules out path traversal,
since neither `/` nor `..` can appear in a value matching that pattern. Deleting an archive is
itself recorded to the audit log (`audit.delete_archive`) - there's no undo once a partition has
already been dropped, so this is the last copy.

## Querying the audit log

`audit_log` is a normal (partitioned) table - query it directly:

```sql
-- everything a user did in the last day
SELECT * FROM caskfs.audit_log
WHERE requestor = 'jsmith' AND created > NOW() - INTERVAL '1 day'
ORDER BY audit_log_id;

-- full history of one file
SELECT * FROM caskfs.audit_log
WHERE resource_type = 'file' AND resource_id = '...'
ORDER BY audit_log_id;
```
