-- Adds indexes needed for caskfs.unused_uris (used by `cask-admin admin cleanup-ld`)
-- to run efficiently against large ld_filter/ld_literal tables.
--
-- Run this ONCE with psql, BEFORE `cask init-pg` (which will otherwise try to create
-- these as plain, locking CREATE INDEX statements):
--
--   psql "$CASKFS_PG_CONNECTION_STRING" -f devops/upgrades/ld-cleanup-indexes.sql
--   cask init-pg
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so each statement
-- here must stay unwrapped. Idempotent: safe to run more than once. Run during a quiet
-- period - CONCURRENTLY doesn't block reads/writes, but it does run two full table
-- scans and competes for I/O/CPU with live traffic for its duration. If interrupted, it
-- leaves an INVALID index behind that must be dropped and rebuilt, not auto-retried.

SET search_path TO caskfs;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ld_filter_uri_id ON caskfs.ld_filter(uri_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ld_literal_graph ON caskfs.ld_literal(graph);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ld_literal_predicate ON caskfs.ld_literal(predicate);

ANALYZE caskfs.ld_filter;
ANALYZE caskfs.ld_literal;
