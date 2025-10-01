CREATE SCHEMA IF NOT EXISTS caskfs;

CREATE TABLE IF NOT EXISTS caskfs.config (
  config_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(256) NOT NULL UNIQUE,
  value       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS caskfs.auto_path_partition (
  auto_path_partition_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     VARCHAR(256) NOT NULL UNIQUE,
  index                    INTEGER,
  filter_regex             TEXT,
  get_value                TEXT
);

CREATE TABLE IF NOT EXISTS caskfs.auto_path_bucket (
  auto_path_bucket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(256) NOT NULL UNIQUE,
  index                INTEGER,
  filter_regex         TEXT,
  get_value            TEXT
);