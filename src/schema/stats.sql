CREATE OR REPLACE VIEW caskfs.stats AS
SELECT
    (SELECT COUNT(*) FROM caskfs.hash) AS total_hashes,
    (SELECT COUNT(*) FROM caskfs.unused_hashes) AS unused_hashes,
    (SELECT COUNT(*) FROM caskfs.file) AS total_files,
    (SELECT COUNT(*) FROM caskfs.directory) AS total_directories,
    (SELECT COUNT(*) FROM caskfs.partition_key) AS total_partition_keys,
    (SELECT COUNT(*) FROM caskfs.acl_user) AS total_acl_users,
    (SELECT COUNT(*) FROM caskfs.acl_role) AS total_acl_roles,
    (SELECT COUNT(*) FROM caskfs.ld_filter WHERE type = 'subject') AS total_ld_subject_filters,
    (SELECT COUNT(*) FROM caskfs.ld_filter WHERE type = 'predicate') AS total_ld_predicate_filters,
    (SELECT COUNT(*) FROM caskfs.ld_filter WHERE type = 'object') AS total_ld_object_filters,
    (SELECT COUNT(*) FROM caskfs.ld_filter WHERE type = 'graph') AS total_ld_graph_filters,
    (SELECT COUNT(*) FROM caskfs.ld_filter WHERE type = 'type') AS total_ld_type_filters,
    (SELECT COUNT(*) FROM caskfs.ld_link) AS total_ld_links,
    (SELECT COUNT(*) FROM caskfs.ld_literal) AS total_ld_literals;