CREATE SCHEMA IF NOT EXISTS caskfs;
SET search_path TO caskfs;

---
-- Layer 2: RDF in graph form of nodes and links
---
DO $$
BEGIN
CREATE TYPE caskfs.ld_filter_type AS ENUM ('graph', 'subject', 'predicate', 'object', 'type');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- URI lookup table for normalization
CREATE TABLE IF NOT EXISTS caskfs.uri (
  uri_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uri VARCHAR(1028) NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_uri_value ON caskfs.uri(uri);
CREATE INDEX IF NOT EXISTS idx_uri_value_hash ON caskfs.uri USING hash(uri);

CREATE OR REPLACE FUNCTION caskfs.upsert_uri(p_uri VARCHAR(1028)) RETURNS UUID AS $$
DECLARE
    v_uri_id UUID;
BEGIN
    SELECT uri_id INTO v_uri_id FROM caskfs.uri WHERE uri = p_uri;

    IF v_uri_id IS NOT NULL THEN
        RETURN v_uri_id;
    END IF;

    INSERT INTO caskfs.uri (uri)
    VALUES (p_uri)
    ON CONFLICT (uri) DO NOTHING
    RETURNING uri_id INTO v_uri_id;

    RETURN v_uri_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.get_uri_id(p_uri VARCHAR(1028)) RETURNS UUID AS $$
    SELECT uri_id FROM caskfs.uri WHERE uri = p_uri;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

CREATE TABLE IF NOT EXISTS caskfs.ld_filter (
  ld_filter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type ld_filter_type NOT NULL,
  uri_id UUID NOT NULL,
  UNIQUE(type, uri_id)
);
CREATE INDEX IF NOT EXISTS idx_ld_filter_type_uri ON caskfs.ld_filter(type, uri_id);

CREATE TABLE IF NOT EXISTS caskfs.file_ld_filter (
    file_ld_filter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES caskfs.file(file_id) ON DELETE CASCADE,
    ld_filter_id UUID NOT NULL REFERENCES caskfs.ld_filter(ld_filter_id),
    UNIQUE(file_id, ld_filter_id)
);
CREATE INDEX IF NOT EXISTS idx_file_ld_filter_file_id ON caskfs.file_ld_filter(file_id);
CREATE INDEX IF NOT EXISTS idx_file_ld_filter_ld_filter_id ON caskfs.file_ld_filter(ld_filter_id);

CREATE OR REPLACE VIEW caskfs.file_ld_filter_view AS
SELECT
    flf.file_ld_filter_id,
    fv.filepath,
    ldf.type,
    u.uri
FROM caskfs.file_ld_filter flf
LEFT JOIN caskfs.file_view fv ON flf.file_id = fv.file_id
LEFT JOIN caskfs.ld_filter ldf ON flf.ld_filter_id = ldf.ld_filter_id
LEFT JOIN caskfs.uri u ON ldf.uri_id = u.uri_id;

CREATE TABLE IF NOT EXISTS caskfs.ld_link (
    ld_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predicate UUID NOT NULL,
    object UUID NOT NULL,
    UNIQUE(predicate, object)
);
CREATE INDEX IF NOT EXISTS idx_ld_link_predicate ON caskfs.ld_link(predicate);
CREATE INDEX IF NOT EXISTS idx_ld_link_object ON caskfs.ld_link(object);

CREATE TABLE IF NOT EXISTS caskfs.file_ld_link (
    file_ld_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES caskfs.file(file_id) ON DELETE CASCADE,
    ld_link_id UUID NOT NULL REFERENCES caskfs.ld_link(ld_link_id),
    UNIQUE(file_id, ld_link_id)
);
CREATE INDEX IF NOT EXISTS idx_file_ld_link_ld_link_file_id ON caskfs.file_ld_link (ld_link_id, file_id);
CREATE INDEX IF NOT EXISTS idx_file_ld_link_file_id ON caskfs.file_ld_link(file_id);
CREATE INDEX IF NOT EXISTS idx_file_ld_link_ld_link_id ON caskfs.file_ld_link(ld_link_id);

CREATE OR REPLACE VIEW caskfs.file_ld_link_view AS
SELECT
    fll.file_ld_link_id,
    fv.filepath,
    pu.uri AS predicate,
    ou.uri AS object
FROM caskfs.file_ld_link fll
LEFT JOIN caskfs.file_view fv ON fll.file_id = fv.file_id
LEFT JOIN caskfs.ld_link ll ON fll.ld_link_id = ll.ld_link_id
LEFT JOIN caskfs.uri pu ON ll.predicate = pu.uri_id
LEFT JOIN caskfs.uri ou ON ll.object = ou.uri_id;

CREATE TABLE IF NOT EXISTS caskfs.ld_literal (
    ld_literal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    graph UUID NOT NULL,
    subject UUID NOT NULL,
    predicate UUID NOT NULL,
    value TEXT NOT NULL,
    language VARCHAR(32) DEFAULT '' NOT NULL,
    datatype VARCHAR(256) DEFAULT '' NOT NULL,
    UNIQUE(graph, subject, predicate, value, language, datatype)
);
CREATE INDEX IF NOT EXISTS idx_ld_literal_subject ON caskfs.ld_literal(subject);

CREATE TABLE IF NOT EXISTS caskfs.file_ld_literal (
    file_ld_literal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES caskfs.file(file_id) ON DELETE CASCADE,
    ld_literal_id UUID NOT NULL REFERENCES caskfs.ld_literal(ld_literal_id),
    UNIQUE(file_id, ld_literal_id)
);
CREATE INDEX IF NOT EXISTS idx_file_ld_literal_file_id ON caskfs.file_ld_literal(file_id);
CREATE INDEX IF NOT EXISTS idx_file_ld_literal_ld_literal_id ON caskfs.file_ld_literal(ld_literal_id);

CREATE OR REPLACE VIEW caskfs.file_ld_literal_view AS
SELECT
    fll.file_ld_literal_id,
    fv.file_id,
    fv.filepath,
    gu.uri AS graph,
    su.uri AS subject,
    pu.uri AS predicate,
    ll.value AS object,
    ll.language AS language,
    ll.datatype AS datatype
FROM caskfs.file_ld_literal fll
LEFT JOIN caskfs.file_view fv ON fll.file_id = fv.file_id
LEFT JOIN caskfs.ld_literal ll ON fll.ld_literal_id = ll.ld_literal_id
LEFT JOIN caskfs.uri pu ON ll.predicate = pu.uri_id
LEFT JOIN caskfs.uri su ON ll.subject = su.uri_id
LEFT JOIN caskfs.uri gu ON ll.graph = gu.uri_id;


CREATE OR REPLACE FUNCTION caskfs.insert_file_ld_filter(
    p_file_id UUID,
    p_type caskfs.ld_filter_type,
    p_uri VARCHAR(1028)
)
RETURNS VOID AS $$
DECLARE
    v_uri_id UUID;
BEGIN
    v_uri_id := caskfs.upsert_uri(p_uri);

    INSERT INTO caskfs.ld_filter (type, uri_id)
    VALUES (p_type, v_uri_id)
    ON CONFLICT (type, uri_id) DO NOTHING;

    INSERT INTO caskfs.file_ld_filter (file_id, ld_filter_id)
    VALUES (
        p_file_id,
        (SELECT ld_filter_id FROM caskfs.ld_filter WHERE type = p_type AND uri_id = v_uri_id)
    )
    ON CONFLICT (file_id, ld_filter_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.insert_file_ld_link(
    p_file_id UUID,
    p_predicate VARCHAR(1028),
    p_object VARCHAR(1028)
) RETURNS VOID AS $$
DECLARE
    v_predicate_uri_id UUID;
    v_object_uri_id UUID;
BEGIN
    v_predicate_uri_id := caskfs.upsert_uri(p_predicate);
    v_object_uri_id := caskfs.upsert_uri(p_object); 
    INSERT INTO caskfs.ld_link (predicate, object)
    VALUES (v_predicate_uri_id, v_object_uri_id)
    ON CONFLICT (predicate, object) DO NOTHING;

    INSERT INTO caskfs.file_ld_link (file_id, ld_link_id)
    VALUES (
        p_file_id,
        (SELECT ld_link_id FROM caskfs.ld_link WHERE predicate = v_predicate_uri_id AND object = v_object_uri_id)
    )
    ON CONFLICT (file_id, ld_link_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.insert_file_ld_literal(
    p_file_id UUID,
    p_graph VARCHAR(1028),
    p_subject VARCHAR(1028),
    p_predicate VARCHAR(1028),
    p_value TEXT,
    p_language VARCHAR(32) DEFAULT NULL,
    p_datatype VARCHAR(256) DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_graph_uri_id UUID;
    v_subject_uri_id UUID;
    v_predicate_uri_id UUID;
BEGIN
    IF p_graph IS NOT NULL THEN
        v_graph_uri_id := caskfs.upsert_uri(p_graph);
    END IF;
    v_subject_uri_id := caskfs.upsert_uri(p_subject);
    v_predicate_uri_id := caskfs.upsert_uri(p_predicate);

    IF p_language IS NULL THEN
        p_language := '';
    END IF;

    IF p_datatype IS NULL THEN
        p_datatype := '';
    END IF;

    INSERT INTO caskfs.ld_literal (graph, subject, predicate, value, language, datatype)
    VALUES (v_graph_uri_id, v_subject_uri_id, v_predicate_uri_id,
            p_value, p_language, p_datatype)
    ON CONFLICT (graph, subject, predicate, value, language, datatype) DO NOTHING;

    INSERT INTO caskfs.file_ld_literal (file_id, ld_literal_id)
    VALUES (
        p_file_id,
        (SELECT ld_literal_id FROM caskfs.ld_literal 
         WHERE 
            graph = v_graph_uri_id AND 
            subject = v_subject_uri_id AND 
            predicate = v_predicate_uri_id AND 
            value = p_value AND
            language = p_language AND
            datatype = p_datatype
        )
    )
    ON CONFLICT (file_id, ld_literal_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;