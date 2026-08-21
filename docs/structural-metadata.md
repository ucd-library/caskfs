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
- [Relative references and the boundary](#relative-references-and-the-boundary)

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
all resolve correctly at the new path, because none of them are path-keyed. Layer 3 is different:
a binary file's node identity is a `cask://` URI derived from its path (see [the bridge](#the-cask-bridge)
above), so a move can leave RDF triples pointing at a stale location.

`mv` closes part of this gap itself: after a move commits, it [reharvests](ld.md#reharvest) the moved
file — or, for a directory move, every `resourceType: rdf` file in the subtree — which re-parses each
file's JSON-LD content and re-resolves any [relative `cask:/` references](ld.md#reference-binary-file)
it contains against its new path. `cask reharvest <path>` is the same operation available standalone,
for cases `mv` doesn't cover: files moved by something other than `cask mv` (a bulk backend change, a
restored backup), or a harvesting-config change you want reflected retroactively.

What this does **not** do is fix references living in *other*, unmoved files that point at something
inside the moved file or subtree. An external file's own path didn't change, so reharvesting it just
recomputes the same relative-to-itself resolution and reproduces the same, now-stale, absolute URI —
there's nothing about the move for that file to detect. That remains a Layer 3 concern, out of scope
for structural metadata, and a known limitation of the path-derived `cask://` URI scheme: a move only
self-heals references that live inside the moved material itself, never references arriving from
outside it.

## Relative references and the boundary

The [relative-path and reference-via-extension forms](ld.md#reference-binary-file) of a `cask:/`
reference resolve against the *referencing* file's own path every time that file is (re)harvested —
never against a fixed absolute string. That is exactly what lets the reharvest described above repair
references for free: move a JSON-LD file together with whatever it points at, preserving their relative
offset — the common case when a whole directory moves as one unit — and the reharvest that `mv`/
`reharvest` triggers recomputes the correct new `cask://` URI with no edit to the JSON-LD source. A
full, absolute `cask://path/to/file` reference has no such mechanism: it is the same string before and
after reharvest, so once its target moves it is simply wrong until someone edits the source text and
re-harvests it by hand.

This convenience has a sharp edge, though: relative resolution is relative *to the referencer*, not
bound to a particular target. If a file carrying a relative reference moves without whatever it points
at moving alongside it, reharvesting doesn't leave the reference harmlessly stale — it recomputes a
*new* absolute URI from the same relative id against the file's new location, which may land on an
unrelated file, or nothing at all, rather than the original target. A full-path reference degrades more
predictably in the same scenario: it stays wrong, but visibly and unambiguously so, still pointed at the
original (now-stale) location, rather than silently repointed elsewhere.

So: prefer relative references for content that always moves or gets copied as a unit — a metadata file
alongside the binary it documents, a directory of interlinked JSON-LD records. That is exactly the case
the automatic reharvest on `mv` handles well. Prefer full-path references when a file's relationships
point outside anything that might plausibly move with it — going stale-but-obvious is safer there than
silently repointing at whatever now happens to occupy that relative slot.
