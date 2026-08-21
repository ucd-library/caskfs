----------------
-- audit_log
----------------
-- Append-only audit trail of mutating operations. Off by default (config.audit.enabled) -
-- see CaskFs#logAudit() in src/index.js. Partitioned by month so old data can be rotated out
-- to a compressed archive on disk (see `cask audit rotate`) without a slow DELETE + VACUUM
-- cycle on a table that would otherwise grow unbounded. Not FK'd to file/directory/acl_*
-- tables - resource_id is deliberately polymorphic, same precedent as acl_permission's
-- principal_id above.

-- One shared sequence for every partition. GENERATED ALWAYS AS IDENTITY would give each
-- partition its OWN independent counter, silently breaking global ordering the moment there's
-- more than one partition - this sequence is what keeps audit_log_id a true monotonic cursor
-- across the whole table, which future WAL-style replica sync depends on.
CREATE SEQUENCE IF NOT EXISTS caskfs.audit_log_seq;

CREATE TABLE IF NOT EXISTS caskfs.audit_log (
    audit_log_id  BIGINT NOT NULL DEFAULT nextval('caskfs.audit_log_seq'),
    created       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requestor     TEXT NOT NULL,
    ip_address    INET,
    operation     TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id   UUID,
    resource_path TEXT,
    cork_trace_id UUID,
    details       JSONB NOT NULL DEFAULT '{}',
    -- Postgres requires the partition key (created) to be part of any PK/unique constraint
    -- on a partitioned table; audit_log_id is still effectively globally unique on its own
    -- thanks to the shared sequence above.
    PRIMARY KEY (audit_log_id, created)
) PARTITION BY RANGE (created);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON caskfs.audit_log (created);
CREATE INDEX IF NOT EXISTS idx_audit_log_requestor ON caskfs.audit_log (requestor);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON caskfs.audit_log (resource_type, resource_id);

-- Create (if missing) the monthly partition covering p_month. Idempotent and safe under
-- concurrent callers. Called both from insert_audit_log (self-heals the current month on
-- every write, so audit logging never fails just because a rotation job hasn't run in a
-- while) and from `cask audit rotate` (to keep the next month ready ahead of time).
CREATE OR REPLACE FUNCTION caskfs.ensure_audit_partition(p_month DATE)
RETURNS VOID AS $$
DECLARE
    v_start DATE := date_trunc('month', p_month)::date;
    v_end   DATE := (date_trunc('month', p_month) + INTERVAL '1 month')::date;
    v_name  TEXT := 'audit_log_' || to_char(v_start, 'YYYY_MM');
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'caskfs' AND c.relname = v_name
    ) THEN
        RETURN;
    END IF;

    BEGIN
        EXECUTE format(
            'CREATE TABLE caskfs.%I PARTITION OF caskfs.audit_log FOR VALUES FROM (%L) TO (%L)',
            v_name, v_start, v_end
        );
    EXCEPTION WHEN duplicate_table THEN
        NULL; -- another concurrent caller created it first
    END;
END;
$$ LANGUAGE plpgsql;

-- Single entry point for writing an audit row. Wraps ensure_audit_partition so callers never
-- have to think about partition management, matching the insert_file()/update_file() pattern
-- used elsewhere in this schema.
CREATE OR REPLACE FUNCTION caskfs.insert_audit_log(
    p_requestor TEXT,
    p_operation TEXT,
    p_resource_type TEXT,
    p_ip_address INET DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_resource_path TEXT DEFAULT NULL,
    p_cork_trace_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
    v_audit_log_id BIGINT;
BEGIN
    PERFORM caskfs.ensure_audit_partition(NOW()::date);

    INSERT INTO caskfs.audit_log (
        requestor, ip_address, operation, resource_type, resource_id, resource_path, cork_trace_id, details
    ) VALUES (
        p_requestor, p_ip_address, p_operation, p_resource_type, p_resource_id, p_resource_path, p_cork_trace_id, p_details
    ) RETURNING audit_log_id INTO v_audit_log_id;

    RETURN v_audit_log_id;
END;
$$ LANGUAGE plpgsql;

-- Bootstrap the current and next month's partitions on every schema init so a fresh
-- deployment (or one that's been dormant) always has headroom before the first write.
SELECT caskfs.ensure_audit_partition(NOW()::date);
SELECT caskfs.ensure_audit_partition((NOW() + INTERVAL '1 month')::date);
