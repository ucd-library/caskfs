CREATE SCHEMA IF NOT EXISTS caskfs;

CREATE TABLE IF NOT EXISTS caskfs.hash (
  hash_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value         VARCHAR(256) NOT NULL UNIQUE,
  digests       JSONB NOT NULL DEFAULT '{}'::jsonb,
  bucket        VARCHAR(256),
  size          BIGINT,
  created       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nquads        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_hash_value ON caskfs.hash(value);


WITH subject_match AS (
        SELECT ld_filter_id FROM caskfs.ld_filter
        WHERE type = 'subject' AND uri_id = caskfs.get_uri_id('cask://ag_eng')
      ),
      subject_file_match AS (
        SELECT DISTINCT f.file_id FROM caskfs.file_ld_filter f
        JOIN subject_match sm ON sm.ld_filter_id = f.ld_filter_id
      ),
      files AS (
        SELECT file_id FROM subject_file_match
      )
      SELECT
        fv.*
      FROM files f
      JOIN caskfs.file_view fv ON fv.file_id = f.file_id
      ORDER BY fv.filepath ASC;
      