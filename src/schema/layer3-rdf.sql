CREATE SCHEMA IF NOT EXISTS caskfs;
SET search_path TO caskfs;

---
-- Layer 2: RDF in graph form of nodes and links
---

-- URI lookup table for normalization
-- CREATE TABLE IF NOT EXISTS caskfs.uri (
--   uri_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   uri VARCHAR(1028) NOT NULL UNIQUE
-- );
-- CREATE INDEX IF NOT EXISTS idx_uri_value ON caskfs.uri(uri);
-- CREATE INDEX IF NOT EXISTS idx_uri_value_hash ON caskfs.uri USING hash(uri);

-- Normalized RDF table with foreign key references
CREATE TABLE IF NOT EXISTS caskfs.rdf_link (
  rdf_link_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       UUID NOT NULL REFERENCES caskfs.file(file_id),
  graph      VARCHAR(1028) NOT NULL,
  subject    VARCHAR(1028) NOT NULL,
  predicate  VARCHAR(1028) NOT NULL,
  object     VARCHAR(1028) NOT NULL,
  UNIQUE(file_id, graph, subject, predicate, object)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rdf_file_id ON caskfs.rdf_link(file_id);
CREATE INDEX IF NOT EXISTS idx_rdf_subject ON caskfs.rdf_link(subject);
CREATE INDEX IF NOT EXISTS idx_rdf_predicate ON caskfs.rdf_link(predicate);
CREATE INDEX IF NOT EXISTS idx_rdf_graph ON caskfs.rdf_link(graph);
CREATE INDEX IF NOT EXISTS idx_rdf_object ON caskfs.rdf_link(object);
CREATE INDEX IF NOT EXISTS rdf_link_object_file_idx ON caskfs.rdf_link(object, file_id);
CREATE INDEX IF NOT EXISTS rdf_link_subject_object_idx ON caskfs.rdf_link(subject, object);


CREATE TABLE IF NOT EXISTS caskfs.rdf_node (
    rdf_node_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id      UUID NOT NULL REFERENCES caskfs.file(file_id),
    graph        VARCHAR(1028) NOT NULL,
    subject      VARCHAR(1028) NOT NULL,
    data         JSONB NOT NULL,
    context      JSONB NOT NULL DEFAULT '{}',
    nquads       TEXT NOT NULL DEFAULT '',
    UNIQUE(file_id, graph, subject)         
);
CREATE INDEX IF NOT EXISTS idx_rdf_node_file_id ON caskfs.rdf_node(file_id);
CREATE INDEX IF NOT EXISTS idx_rdf_node_graph ON caskfs.rdf_node(graph);
CREATE INDEX IF NOT EXISTS idx_rdf_node_subject ON caskfs.rdf_node(subject);


CREATE OR REPLACE FUNCTION caskfs.insert_rdf_node(
    p_file_id UUID,
    p_graph VARCHAR(1028),
    p_subject VARCHAR(1028),
    p_data JSONB,
    p_context JSONB DEFAULT '{}',
    p_nquads TEXT DEFAULT ''
) RETURNS UUID AS $$
DECLARE
    v_graph_id UUID;
    v_subject_id UUID;
    v_rdf_id UUID;
BEGIN
    -- Get or create URIs
    IF p_graph IS NULL THEN
        p_graph := 'cask:/default';
    END IF;

    -- Insert RDF triple
    INSERT INTO caskfs.rdf_node (file_id, graph, subject, data, context, nquads)
    VALUES (p_file_id, p_graph, p_subject, p_data, p_context, p_nquads)
    ON CONFLICT (file_id, graph, subject) DO UPDATE
      SET data = EXCLUDED.data,
        context = EXCLUDED.context,
        nquads = EXCLUDED.nquads
    RETURNING rdf_node_id INTO v_rdf_id;

    RETURN v_rdf_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.insert_rdf_link (
    p_file_id UUID,
    p_graph VARCHAR(1028),
    p_subject VARCHAR(1028),
    p_predicate VARCHAR(1028),
    p_object TEXT
) RETURNS UUID AS $$
DECLARE
    v_graph_id UUID;
    v_subject_id UUID;
    v_predicate_id UUID;
    v_object_id UUID;
    v_rdf_id UUID;
BEGIN
    -- Get or create URIs
    IF p_graph IS NULL THEN
        p_graph := 'cask:/default';
    END IF;

    -- Insert RDF triple
    INSERT INTO caskfs.rdf_link (file_id, graph, subject, predicate, object)
    VALUES (p_file_id, p_graph, p_subject, p_predicate, p_object)
    ON CONFLICT (file_id, graph, subject, predicate, object) DO NOTHING
    RETURNING rdf_link_id INTO v_rdf_id;

    RETURN v_rdf_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.insert_rdf_node_bulk(
    p_file_id UUID,
    p_triples JSONB
) RETURNS VOID AS $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN
        SELECT
            (triple->>'graph') AS graph,
            (triple->>'subject') AS subject,
            (triple->>'data')::JSONB AS data,
            (triple->>'context')::JSONB AS context,
            (triple->>'nquads') AS nquads
        FROM jsonb_array_elements(p_triples) AS triple
    LOOP
        PERFORM caskfs.insert_rdf_node(
            p_file_id,
            COALESCE(t_record.graph, 'cask:/default'),
            t_record.subject,
            t_record.data::JSONB,
            t_record.context::JSONB,
            t_record.nquads
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.insert_rdf_link_bulk(
    p_file_id UUID,
    p_triples JSONB
) RETURNS VOID AS $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN
        SELECT
            (triple->>'graph') AS graph,
            (triple->>'subject') AS subject,
            (triple->>'predicate') AS predicate,
            (triple->>'object') AS object
        FROM jsonb_array_elements(p_triples) AS triple
    LOOP
        PERFORM caskfs.insert_rdf_link(
            p_file_id,
            COALESCE(t_record.graph, 'cask:/default'),
            t_record.subject,
            t_record.predicate,
            t_record.object
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.remove_rdf_by_file(p_file_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM caskfs.rdf_link WHERE file_id = p_file_id;
    DELETE FROM caskfs.rdf_node WHERE file_id = p_file_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION caskfs.cleanup_unused_uris()
RETURNS VOID AS $$
BEGIN
    DELETE FROM caskfs.uri
    WHERE uri_id NOT IN (
        SELECT DISTINCT graph_id FROM caskfs.rdf_link
        UNION
        SELECT DISTINCT subject_id FROM caskfs.rdf_link
        UNION
        SELECT DISTINCT predicate_id FROM caskfs.rdf_link
        UNION
        SELECT DISTINCT object_id FROM caskfs.rdf_link
        UNION
        SELECT DISTINCT graph_id FROM caskfs.rdf_node
        UNION
        SELECT DISTINCT subject_id FROM caskfs.rdf_node
    );
END;
$$ LANGUAGE plpgsql;

-- View to make querying easier (resolves URIs back to strings)
CREATE OR REPLACE VIEW caskfs.rdf_link_view AS
SELECT
    r.rdf_link_id,
    r.file_id,
    f.directory_id AS directory_id,
    f.filepath as containment,
    r.graph,
    r.subject,
    r.predicate,
    r.object,
    f.partition_keys AS partition_keys
FROM caskfs.rdf_link r
LEFT JOIN caskfs.file_view f ON r.file_id = f.file_id;

CREATE OR REPLACE VIEW caskfs.rdf_node_view AS
SELECT
    d.rdf_node_id,
    d.file_id,
    f.directory_id AS directory_id,
    f.filepath as containment,
    d.graph,
    d.subject,
    d.data AS data,
    d.context AS context,
    d.nquads AS nquads,
    f.partition_keys AS partition_keys
FROM caskfs.rdf_node d
LEFT JOIN caskfs.file_view f ON d.file_id = f.file_id;