-- CaskFS database upgrade: git tag 0.2.1 -> main
--
-- Run this ONCE with psql against a database that was initialized from tag 0.2.1's
-- schema, BEFORE running `cask init-pg` against the same database:
--
--   psql "$CASKFS_PG_CONNECTION_STRING" -f devops/upgrades/0.2.1-to-main.sql
--   cask init-pg
--
-- Everything that changed in src/schema/*.sql between 0.2.1 and main is written as
-- idempotent CREATE ... IF NOT EXISTS / CREATE OR REPLACE statements, so `cask init-pg`
-- (which just re-runs those files) picks it up automatically on its own. The two
-- exceptions are handled here, because CREATE TABLE IF NOT EXISTS is a no-op against a
-- table that already exists and can't add or restructure columns on it:
--
--   1. auto_path_partition / auto_path_bucket gained a new full_regex column.
--   2. acl_permission.role_id (nullable FK to acl_role) was replaced with
--      principal_type + principal_id, so a grant can target a role OR a user. Existing
--      rows are backfilled as role-based grants, since that's the only kind that
--      existed before this change.
--
-- This script is idempotent: safe to run more than once, and a no-op if run against a
-- database that's already on main.

SET search_path TO caskfs;

ALTER TABLE caskfs.auto_path_partition ADD COLUMN IF NOT EXISTS full_regex TEXT;
ALTER TABLE caskfs.auto_path_bucket ADD COLUMN IF NOT EXISTS full_regex TEXT;

DO $$
DECLARE
    r RECORD;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'caskfs' AND table_name = 'acl_permission' AND column_name = 'role_id'
    ) THEN
        RETURN; -- already migrated
    END IF;

    BEGIN
        CREATE TYPE caskfs.principal_type AS ENUM ('role', 'user');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    ALTER TABLE caskfs.acl_permission ADD COLUMN principal_type caskfs.principal_type;
    ALTER TABLE caskfs.acl_permission ADD COLUMN principal_id UUID;

    UPDATE caskfs.acl_permission SET principal_type = 'role', principal_id = role_id;

    ALTER TABLE caskfs.acl_permission ALTER COLUMN principal_type SET NOT NULL;
    ALTER TABLE caskfs.acl_permission ALTER COLUMN principal_id SET NOT NULL;

    -- Drop every constraint tied to role_id (the old FK to acl_role, and the old
    -- UNIQUE(root_directory_acl_id, permission, role_id)) without assuming Postgres's
    -- auto-generated constraint names.
    FOR r IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
        WHERE c.conrelid = 'caskfs.acl_permission'::regclass AND a.attname = 'role_id'
    LOOP
        EXECUTE format('ALTER TABLE caskfs.acl_permission DROP CONSTRAINT %I', r.conname);
    END LOOP;

    DROP INDEX IF EXISTS caskfs.idx_acl_permission_role_id_permission;

    -- These views reference acl_permission.role_id directly; cask init-pg (run right
    -- after this script) recreates all of them from the current layer2-fs.sql, so
    -- dropping them here (CASCADE to catch the views that depend on these) is safe.
    DROP VIEW IF EXISTS caskfs.directory_user_permissions_lookup_by_permission CASCADE;
    DROP VIEW IF EXISTS caskfs.directory_user_permissions_by_permission CASCADE;

    ALTER TABLE caskfs.acl_permission DROP COLUMN role_id;

    ALTER TABLE caskfs.acl_permission
        ADD CONSTRAINT acl_permission_root_directory_acl_id_permission_principal_key
        UNIQUE (root_directory_acl_id, permission, principal_type, principal_id);
END $$;
