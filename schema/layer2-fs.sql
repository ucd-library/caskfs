CREATE SCHEMA IF NOT EXISTS caskfs;
SET search_path TO caskfs;

---
-- Layer 2: Filesystem with directories and ACLs
---

-- Directory ACLs
CREATE TABLE IF NOT EXISTS caskfs.directory_acl (
    directory_acl_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- see below for adding this cyclic reference
    -- directory_id      UUID NOT NULL REFERENCES caskfs.directory(directory_id),
    read              VARCHAR(256)[],
    write             VARCHAR(256)[],
    created           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- UNIQUE(directory_id)
);

-- Directory
CREATE TABLE IF NOT EXISTS caskfs.directory (
    directory_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fullname        VARCHAR(256) NOT NULL UNIQUE,
    name            VARCHAR(256) GENERATED ALWAYS AS (
      CASE WHEN fullname = '/' THEN '/'
      ELSE REGEXP_REPLACE(TRIM(fullname), '/$', '') END
    ) STORED,
    parent_id      UUID REFERENCES caskfs.directory(directory_id),
    directory_acl_id            UUID REFERENCES caskfs.directory_acl(directory_acl_id),
    created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_directory_name ON caskfs.directory(name);
CREATE INDEX IF NOT EXISTS idx_directory_parent_id ON caskfs.directory(parent_id);

-- Manually add directory_id to directory_acl as its cyclic reference
ALTER TABLE caskfs.directory_acl ADD COLUMN IF NOT EXISTS directory_id UUID NOT NULL REFERENCES caskfs.directory(directory_id);
DO $$
BEGIN
    ALTER TABLE caskfs.directory_acl ADD CONSTRAINT unique_directory_id UNIQUE(directory_id);
EXCEPTION
    WHEN others THEN NULL;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_directory_acl_directory_id ON caskfs.directory_acl(directory_id);

-- Ensure root directory exists
INSERT INTO caskfs.directory (fullname, parent_id) VALUES ('/', NULL) ON CONFLICT (fullname) DO NOTHING;

-- Function to get directory_id by fullname
CREATE OR REPLACE FUNCTION caskfs.get_directory_id(p_fullname VARCHAR(256))
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT directory_id FROM caskfs.directory WHERE fullname = p_fullname);
END;
$$ LANGUAGE plpgsql;



CREATE OR REPLACE VIEW caskfs.directory_acl_view AS
SELECT
    d.directory_id,
    da.directory_acl_id,
    d.parent_id,
    d.fullname AS directory,
    da.read,
    da.write,
    CASE
      WHEN da.directory_id = d.directory_id THEN TRUE
      ELSE FALSE
    END AS is_explicit
FROM caskfs.directory d
LEFT JOIN caskfs.directory_acl da ON d.directory_acl_id = da.directory_acl_id;

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
    h.size AS size
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
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_file_id UUID;
BEGIN
    WITH hash_upsert AS (
        INSERT INTO caskfs.hash (value, digests, size) 
        VALUES (p_hash_value, p_digests, p_size)
        ON CONFLICT (value) DO UPDATE SET value = EXCLUDED.value, digests = EXCLUDED.digests, size = EXCLUDED.size
        RETURNING hash_id
    )
    INSERT INTO caskfs.file (directory_id, name, hash_id, metadata, partition_keys)
    SELECT p_directory_id, p_filename, hash_id, p_metadata, p_partition_keys
    FROM hash_upsert
    RETURNING file_id INTO v_file_id;

    RETURN v_file_id;
END;
$$ LANGUAGE plpgsql;

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
CREATE TRIGGER trigger_directory_acl_update_modified
    BEFORE UPDATE ON caskfs.directory_acl
    FOR EACH ROW
    EXECUTE FUNCTION caskfs.update_modified_timestamp();

-- Trigger for directory table
CREATE TRIGGER trigger_directory_update_modified
    BEFORE UPDATE ON caskfs.directory
    FOR EACH ROW
    EXECUTE FUNCTION caskfs.update_modified_timestamp();

-- Trigger for file table
CREATE TRIGGER trigger_file_update_modified
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

