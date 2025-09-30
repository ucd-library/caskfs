CREATE SCHEMA IF NOT EXISTS caskfs;

CREATE TABLE IF NOT EXISTS caskfs.hash (
  hash_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value         VARCHAR(256) NOT NULL UNIQUE,
  digests       JSONB NOT NULL DEFAULT '{}'::jsonb,
  size          BIGINT,
  created       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hash_value ON caskfs.hash(value);