CREATE SCHEMA IF NOT EXISTS caskfs;
SET search_path TO caskfs;

---
-- Layer 2: Filesystem with directories and ACLs
---
DO $$
BEGIN
CREATE TYPE caskfs.permission AS ENUM ('read', 'write', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

----------------
-- acl_role
----------------
CREATE TABLE IF NOT EXISTS caskfs.acl_role (
  role_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(256) NOT NULL UNIQUE,
  created    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_role_name ON caskfs.acl_role(name);

----------------
-- acl_user
----------------
CREATE TABLE IF NOT EXISTS caskfs.acl_user (
  user_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(256) NOT NULL UNIQUE,
  created   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_name ON caskfs.acl_user(name);

----------------
-- acl_role_user
----------------
CREATE TABLE IF NOT EXISTS caskfs.acl_role_user (
  acl_role_user_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id          UUID NOT NULL REFERENCES caskfs.acl_role(role_id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES caskfs.acl_user(user_id) ON DELETE CASCADE,
  created         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_acl_role_user_userrole_id ON caskfs.acl_role_user(role_id, user_id);


----------------
-- directory
----------------
CREATE TABLE IF NOT EXISTS caskfs.directory (
    directory_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fullname        VARCHAR(256) NOT NULL UNIQUE,
    name            VARCHAR(256) GENERATED ALWAYS AS (
      CASE WHEN fullname = '/' THEN '/'
      ELSE REGEXP_REPLACE(TRIM(fullname), '/$', '') END
    ) STORED,
    parent_id      UUID REFERENCES caskfs.directory(directory_id),
    created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_directory_name ON caskfs.directory(name);
CREATE INDEX IF NOT EXISTS idx_directory_parent_id ON caskfs.directory(parent_id);

----------------
-- root_directory_acl
----------------
CREATE TABLE IF NOT EXISTS caskfs.root_directory_acl (
    root_directory_acl_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    directory_id         UUID UNIQUE NOT NULL REFERENCES caskfs.directory(directory_id),
    public                 BOOLEAN NOT NULL DEFAULT FALSE,
    modified               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_root_directory_acl_directory_id ON caskfs.root_directory_acl(directory_id);

----------------
-- directory_acl
----------------
CREATE TABLE IF NOT EXISTS caskfs.directory_acl (
    directory_acl_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    directory_id          UUID UNIQUE NOT NULL REFERENCES caskfs.directory(directory_id),
    root_directory_acl_id UUID REFERENCES caskfs.root_directory_acl(root_directory_acl_id),
    modified              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_directory_acl_directory_id ON caskfs.directory_acl(directory_id, root_directory_acl_id);

----------------
-- acl_permission
----------------
CREATE TABLE IF NOT EXISTS caskfs.acl_permission (
    acl_permission_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_directory_acl_id      UUID NOT NULL REFERENCES caskfs.root_directory_acl(root_directory_acl_id) ON DELETE CASCADE,
    permission        caskfs.permission NOT NULL,
    role_id           UUID REFERENCES caskfs.acl_role(role_id),
    created           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(root_directory_acl_id, permission, role_id)
);
CREATE INDEX IF NOT EXISTS idx_acl_permission_role_id ON caskfs.acl_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_acl_permission_root_directory_acl_id ON caskfs.acl_permission(root_directory_acl_id);
CREATE INDEX IF NOT EXISTS idx_acl_permission_role_id_permission ON caskfs.acl_permission(role_id, permission);

----------------
-- acl_user_roles_view
----------------
CREATE OR REPLACE VIEW caskfs.acl_user_roles_view AS
SELECT
    u.user_id,
    u.name AS user,
    r.role_id,
    r.name AS role
FROM caskfs.acl_user u
LEFT JOIN caskfs.acl_role_user ru ON u.user_id = ru.user_id
LEFT JOIN caskfs.acl_role r ON ru.role_id = r.role_id;

----------------
-- directory_user_permissions_lookup
----------------
CREATE OR REPLACE VIEW caskfs.directory_user_permissions_lookup_by_permission AS
SELECT
    d.directory_id,
    u.user_id,
    CASE 
        WHEN p.permission = 'read' THEN TRUE
        WHEN p.permission = 'write' THEN TRUE
        WHEN p.permission = 'admin' THEN TRUE
        WHEN rda.public = TRUE THEN TRUE
        ELSE FALSE
    END AS can_read,
    CASE 
        WHEN p.permission = 'write' THEN TRUE
        WHEN p.permission = 'admin' THEN TRUE
        ELSE FALSE
    END AS can_write,
    CASE 
        WHEN p.permission = 'admin' THEN TRUE
        ELSE FALSE
    END AS is_admin
FROM caskfs.directory d
LEFT JOIN caskfs.directory_acl da ON d.directory_id = da.directory_id
LEFT JOIN caskfs.root_directory_acl rda ON da.root_directory_acl_id = rda.root_directory_acl_id
LEFT JOIN caskfs.acl_permission p ON rda.root_directory_acl_id = p.root_directory_acl_id
LEFT JOIN caskfs.acl_role r ON p.role_id = r.role_id
LEFT JOIN caskfs.acl_role_user ru ON r.role_id = ru.role_id
LEFT JOIN caskfs.acl_user u ON ru.user_id = u.user_id
UNION
SELECT
    d.directory_id,
    NULL as user_id,
    CASE 
        WHEN rda.public = TRUE THEN TRUE
        ELSE FALSE
    END AS can_read,
    FALSE AS can_write,
    FALSE AS is_admin
FROM caskfs.directory d
LEFT JOIN caskfs.directory_acl da ON d.directory_id = da.directory_id
LEFT JOIN caskfs.root_directory_acl rda ON da.root_directory_acl_id = rda.root_directory_acl_id
LEFT JOIN caskfs.directory rd ON rda.directory_id = rd.directory_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS caskfs.directory_user_permissions_lookup AS
SELECT
    directory_id,
    user_id,
    BOOL_OR(can_read) AS can_read,
    BOOL_OR(can_write) AS can_write,
    BOOL_OR(is_admin) AS is_admin
FROM directory_user_permissions_lookup_by_permission p
WHERE can_read OR can_write OR is_admin
GROUP BY directory_id, user_id;

---
-- To refresh the materialized view, use:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY caskfs.directory_user_permissions_lookup;
---

-- Create indexes for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_user_permissions_lookup_unique 
    ON caskfs.directory_user_permissions_lookup(directory_id, user_id);
CREATE INDEX IF NOT EXISTS idx_directory_user_permissions_lookup_directory_id 
    ON caskfs.directory_user_permissions_lookup(directory_id);
CREATE INDEX IF NOT EXISTS idx_directory_user_permissions_lookup_user_id 
    ON caskfs.directory_user_permissions_lookup(user_id);

CREATE OR REPLACE VIEW caskfs.directory_user_permissions_by_permission AS
SELECT
    d.fullname AS directory,
    u.name as user,
    p.acl_permission_id,
    CASE 
        WHEN p.permission = 'read' THEN TRUE
        WHEN p.permission = 'write' THEN TRUE
        WHEN p.permission = 'admin' THEN TRUE
        WHEN rda.public = TRUE THEN TRUE
        ELSE FALSE
    END AS can_read,
    CASE 
        WHEN p.permission = 'write' THEN TRUE
        WHEN p.permission = 'admin' THEN TRUE
        ELSE FALSE
    END AS can_write,
    CASE 
        WHEN p.permission = 'admin' THEN TRUE
        ELSE FALSE
    END AS is_admin,
    rd.fullname AS acl_root_directory
FROM caskfs.directory d
LEFT JOIN caskfs.directory_acl da ON d.directory_id = da.directory_id
LEFT JOIN caskfs.root_directory_acl rda ON da.root_directory_acl_id = rda.root_directory_acl_id
LEFT JOIN caskfs.directory rd ON rda.directory_id = rd.directory_id
LEFT JOIN caskfs.acl_permission p ON rda.root_directory_acl_id = p.root_directory_acl_id
LEFT JOIN caskfs.acl_role r ON p.role_id = r.role_id
LEFT JOIN caskfs.acl_role_user ru ON r.role_id = ru.role_id
LEFT JOIN caskfs.acl_user u ON ru.user_id = u.user_id
UNION
SELECT
    d.fullname AS directory,
    NULL as user,
    NULL as acl_permission_id,
    CASE 
        WHEN rda.public = TRUE THEN TRUE
        ELSE FALSE
    END AS can_read,
    FALSE AS can_write,
    FALSE AS is_admin,
    rd.fullname AS acl_root_directory
FROM caskfs.directory d
LEFT JOIN caskfs.directory_acl da ON d.directory_id = da.directory_id
LEFT JOIN caskfs.root_directory_acl rda ON da.root_directory_acl_id = rda.root_directory_acl_id
LEFT JOIN caskfs.directory rd ON rda.directory_id = rd.directory_id


CREATE OR REPLACE VIEW caskfs.directory_user_permissions AS
SELECT
    directory,
    p.user,
    BOOL_OR(can_read) AS can_read,
    BOOL_OR(can_write) AS can_write,
    BOOL_OR(is_admin) AS is_admin
FROM directory_user_permissions_by_permission p
WHERE can_read OR can_write OR is_admin
GROUP BY directory, p.user;


-- Ensure root directory exists
INSERT INTO caskfs.directory (fullname, parent_id) VALUES ('/', NULL) ON CONFLICT (fullname) DO NOTHING;

-- Function to get directory_id by fullname
CREATE OR REPLACE FUNCTION caskfs.get_directory_id(p_fullname VARCHAR(256))
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT directory_id FROM caskfs.directory WHERE fullname = p_fullname);
END;
$$ LANGUAGE plpgsql;


----------------
-- file
----------------
CREATE TABLE IF NOT EXISTS caskfs.file (
    file_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(256) NOT NULL,
    directory_id    UUID NOT NULL REFERENCES caskfs.directory(directory_id),
    hash_id         UUID NOT NULL REFERENCES caskfs.hash(hash_id),
    partition_keys  VARCHAR(256)[],
    metadata        JSONB NOT NULL DEFAULT '{}',
    created         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(directory_id, name)
);
CREATE INDEX IF NOT EXISTS idx_file_hash_id ON caskfs.file(hash_id);
CREATE INDEX IF NOT EXISTS idx_file_directory ON caskfs.file(directory_id);
CREATE INDEX IF NOT EXISTS idx_file_name ON caskfs.file(name);
CREATE INDEX IF NOT EXISTS idx_file_partition_keys ON caskfs.file USING GIN(partition_keys);
CREATE INDEX IF NOT EXISTS idx_file_directory_name ON caskfs.file(directory_id, name);

----------------
-- file_view
----------------
CREATE OR REPLACE VIEW caskfs.file_view AS
SELECT
    f.file_id,
    d.directory_id,
    d.fullname AS directory,
    f.name as filename,
    CASE
      WHEN d.fullname = '/' THEN '/' || f.name
      ELSE d.fullname || '/' || f.name
    END AS filepath,
    h.value AS hash_value,
    h.digests AS digests,
    f.metadata,
    f.partition_keys,
    f.created,
    f.modified,
    h.size AS size,
    h.bucket AS bucket
FROM caskfs.file f
JOIN caskfs.hash h ON f.hash_id = h.hash_id
LEFT JOIN caskfs.directory d ON f.directory_id = d.directory_id;

-- Function to insert file with automatic hash management
CREATE OR REPLACE FUNCTION caskfs.insert_file(
    p_directory_id UUID,
    p_hash_value VARCHAR(256),
    p_filename VARCHAR(256),
    p_partition_keys VARCHAR(256)[],
    p_digests JSONB DEFAULT '{}'::jsonb,
    p_size BIGINT DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_bucket VARCHAR(256) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_file_id UUID;
BEGIN
    WITH hash_upsert AS (
        INSERT INTO caskfs.hash (value, digests, size, bucket) 
        VALUES (p_hash_value, p_digests, p_size, p_bucket)
        ON CONFLICT (value) DO UPDATE SET 
            value = EXCLUDED.value, 
            digests = EXCLUDED.digests, 
            size = EXCLUDED.size
        RETURNING hash_id
    )
    INSERT INTO caskfs.file (directory_id, name, hash_id, metadata, partition_keys)
    SELECT p_directory_id, p_filename, hash_id, p_metadata, p_partition_keys
    FROM hash_upsert
    RETURNING file_id INTO v_file_id;

    RETURN v_file_id;
END;
$$ LANGUAGE plpgsql;

----------------
-- unused_hashes 
----------------
-- View to show all hashes not in use by any file
CREATE OR REPLACE VIEW caskfs.unused_hashes AS
  SELECT h.hash_id, h.value
  FROM caskfs.hash h
  LEFT JOIN caskfs.file a ON h.hash_id = a.hash_id
  WHERE a.hash_id IS NULL;

-- Trigger function to update modified timestamp
CREATE OR REPLACE FUNCTION caskfs.update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for directory_acl table
CREATE OR REPLACE TRIGGER trigger_directory_acl_update_modified
    BEFORE UPDATE ON caskfs.directory_acl
    FOR EACH ROW
    EXECUTE FUNCTION caskfs.update_modified_timestamp();

-- Trigger for directory table
CREATE OR REPLACE TRIGGER trigger_directory_update_modified
    BEFORE UPDATE ON caskfs.directory
    FOR EACH ROW
    EXECUTE FUNCTION caskfs.update_modified_timestamp();

-- Trigger for file table
CREATE OR REPLACE TRIGGER trigger_file_update_modified
    BEFORE UPDATE ON caskfs.file
    FOR EACH ROW
    EXECUTE FUNCTION caskfs.update_modified_timestamp();

CREATE OR REPLACE VIEW caskfs.stats AS
SELECT
    (SELECT COUNT(*) FROM caskfs.hash) AS total_hashes,
    (SELECT COUNT(*) FROM caskfs.unused_hashes) AS unused_hashes,
    (SELECT COUNT(*) FROM caskfs.file) AS total_files,
    (SELECT COUNT(DISTINCT unnest_value) FROM (
            SELECT UNNEST(partition_keys) AS unnest_value FROM caskfs.file
        ) subq
    ) AS total_partition_keys;

