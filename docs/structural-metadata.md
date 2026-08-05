# Structural Metadata

[Back to Overview](../README.md)

CaskFS treats metadata about a file as two distinct kinds, kept in two separate systems rather than
one combined graph:

- **Structural metadata** answers *where is it, what kind is it, where did it come from*. It describes
  the file or directory object itself — hierarchy, classification, lineage — and is owned entirely by
  the [Filesystem Layer (Layer 2)](fs.md), keyed by the file/directory's internal id (`file_id` /
  `directory_id`), never by its path.
- **Entity/core metadata** answers *what is it, how does it relate to other real-world things*. This is
  the [RDF Layer (Layer 3)](ld.md) — the knowledge graph built from JSON-LD documents and free-form
  triples, describing the people, datasets, and other entities a file represents or contains.

Contents:
- [Why the split](#why-the-split)
- [Three structural facets](#three-structural-facets)
- [The `cask://` bridge](#the-cask-bridge)
- [A known boundary](#a-known-boundary)

## Why the split

Folding structural facts (where a file lives, what category it belongs to, what it was derived from)
into the same RDF graph as domain triples makes both harder to use. Queries end up mixing "where is
this" with "what is this," and every structural fact ends up passing through URI-normalization
machinery that exists for the RDF graph's much larger and more varied vocabulary. It also creates a
fragility problem: Layer 3 node identity for a binary file is a `cask://` URI derived from its current
path (see [the bridge](#the-cask-bridge) below). Structural facts should never break when a file is
renamed or moved — and they don't, as long as they're keyed by id instead of by path.

Keeping the two systems separate means each can be queried and managed the way that fits it — `cask
ls`/`find` for structural questions, `cask rel`/`find --type` for entity questions — without either
concern leaking into the other's query surface.

## Three structural facets

All three are peers, all owned by Layer 2, and all survive `cask mv` (see [fs.md](fs.md#move))
because none of them reference a path.

1. **Hierarchy** — the directory tree (`directory` table, `parent_id`). Managed with `cask ls`,
   `cask mv`, `cask rm -d`.
2. **Classification** — partition keys (`file_partition_key`), tagging files for scoped querying.
   File-only; there is no directory-level equivalent. Set at write time (`--partition-keys`) or via
   [auto-path rules](auto-path.md).
3. **Lineage** — derivative links (`derivative_link`), recording that one file was derived from
   another (e.g. a medallion-architecture silver file produced from a bronze file). File-to-file only,
   keyed by `file_id` on both ends, so the link survives either file being renamed or moved. Managed
   with `cask lineage add/remove/derivatives/sources` — see [Linked Data](ld.md) for how this differs
   from a Layer 3 relationship. A link's row is removed automatically when either endpoint file is
   deleted; `cask rm -l/--delete-lineage` additionally deletes the downstream derivative files
   themselves, recursively — see [Delete](fs.md#delete).

```bash
# record that a silver file was derived from a bronze file
cask lineage add /silver/2024/report.parquet /bronze/2024/raw.csv

# ask "what did this file come from" / "what came from this file"
cask lineage sources /silver/2024/report.parquet
cask lineage derivatives /bronze/2024/raw.csv
```

The default relation is `http://schema.org/source`; pass `-r/--relation` for a different predicate.
The `metadata` field carried on a lineage edge is a plain text field — deliberately unstructured (e.g.
a job/run id), not something CaskFS queries or interprets.

## The `cask://` bridge

Every file — RDF or not — is also represented as a node in Layer 3 under a `cask://` URI derived from
its path (see [Reference Binary File](ld.md#reference-binary-file)). That node's job is to be a stable
anchor that *entity*-graph triples can point at — `"http://schema.org/image": {"@id":
"cask://photos/alice.jpg"}` — not a place where structural facts about the file live. It is the one
deliberate crossover point between the two worlds: a hook Layer 3 can use to reach into Layer 2, not a
home for hierarchy, classification, or lineage data.

## A known boundary

`cask mv` renames/moves are fully consistent within Layer 2 — hierarchy, classification, and lineage
all resolve correctly at the new path, because none of them are path-keyed. What `mv` does **not** do
is rewrite `cask://` references sitting in *other* files' RDF triples that pointed at the old path —
that remains a Layer 3 concern, out of scope for structural metadata, and a known limitation of the
current path-derived `cask://` URI scheme.
