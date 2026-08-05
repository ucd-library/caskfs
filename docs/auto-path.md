# Auto Path Rules

[Back to File System Overview](./fs.md)

Auto Path Rules allow for automatic assignment of partition keys and bucket names based on file paths. This feature is particularly useful for segmenting data or storage supporting multiple different requirements.

## Key Features
- **Path-Based Rules**: Define rules that match specific path patterns to assign partition keys and bucket names automatically.

## Rule Types
Rules are grouped by `type`, either `partition` (partition keys) or `bucket` (cloud storage bucket names).

## Auto Path Rule Definition
An auto path rule consists of:
 - **name** (string) - Required. A unique name for the auto path rule. Also used as the partition key/bucket name prefix.
 - **index** (number) - Optional. 0-based position of the directory segment (relative to the file's directory path; `0` is the first directory segment) to test/extract. Either `index`, `filterRegex`, or both are required.
 - **filterRegex** (string) - Optional. A regular expression tested against individual path segments (or the single segment selected by `index`, if set). Either `index`, `filterRegex`, or both are required.
 - **fullRegex** (string) - Optional. A regular expression tested against the **entire** file path. If set, the rule is only considered for a file when the whole path matches this regex; if it doesn't match, the rule is skipped entirely. If it does match (or `fullRegex` isn't set at all), the `index`/`filterRegex` checks above still run as usual against the individual path segments. Useful for scoping a rule to a specific subtree or file naming convention before doing per-segment matching.
 - **getValue** (function) - Optional. JavaScript function to extract the partition key from the matched path segment. Otherwise, the default value is `<name>-<pathValue>` (bucket rules use just `<name>`). The function is passed the following arguments:
   - **name** (string): The name of the auto path rule.
   - **pathValue** (string): The matched path segment.
   - **regexMatch** (Array): The result of JavaScript's `String.prototype.match()` against `filterRegex`.

### Example: position-based rule
```json
{
  "name": "env",
  "index": 0
}
```
Path `/production/service/file.txt` → partition key `env-production` (index `0` is the first directory segment, `production`).

### Example: regex filter with custom getValue
```json
{
  "name": "year",
  "filterRegex": "^data-(\\d{4})-",
  "getValue": "return 'year-' + regexMatch[1];"
}
```
Path `/archive/data-2023-jan/file.txt` → partition key `year-2023` (via the custom function, using the regex capture group).

### Example: fullRegex gate
```json
{
  "name": "collection",
  "fullRegex": "^/bronze/dc/.*/collection/.+$",
  "filterRegex": "^dams-(.+)$",
  "getValue": "return 'collection-' + regexMatch[1];"
}
```
Here the rule is only evaluated at all for paths under `/bronze/dc/.../collection/...`; for any other path, `fullRegex` fails to match and the rule is skipped without ever checking `filterRegex`. For a matching path such as `/bronze/dc/cruess/collection/dams-river-1.json`, the normal per-segment `filterRegex` check then runs as usual.

## Managing Rules via the CLI

Auto path rules can be managed with `cask auto-path`:

```bash
# set a single rule
cask auto-path set partition env --position 0

# set a rule with a regex filter and a fullRegex gate
cask auto-path set partition collection \
  --full-regex '^/bronze/dc/.*/collection/.+$' \
  --filter-regex '^dams-(.+)$' \
  --get-value "return 'collection-' + regexMatch[1];"

# test what a rule would extract for a given path, without writing anything
cask auto-path test partition /bronze/dc/cruess/collection/dams-river-1.json

# list all configured rules of a type
cask auto-path list partition

# remove a rule
cask auto-path remove partition collection
```

### Bulk-loading rules from a JSON file
Rather than setting rules one at a time, `cask auto-path load <file-path>` reads a single JSON file describing rules for both `bucket` and `partition` types and applies them all in one pass. The file's top-level keys must be `bucket` and/or `partition`, each an array of rule objects (same shape as above):

```json
{
  "partition": [
    { "name": "env", "index": 0 },
    {
      "name": "collection",
      "fullRegex": "^/bronze/dc/.*/collection/.+$",
      "filterRegex": "^dams-(.+)$",
      "getValue": "return 'collection-' + regexMatch[1];"
    }
  ],
  "bucket": [
    { "name": "cold-storage", "filterRegex": "^archive$" }
  ]
}
```

```bash
cask auto-path load ./auto-path-rules.json
```

Each rule in the file is applied via the same `set()` logic as `cask auto-path set` — for `partition` rules, this means any rule that is new or has actually changed will trigger a retroactive re-scan of existing files so their partition keys stay in sync. A rule that is byte-for-byte identical to what's already stored is left alone and does **not** trigger a rescan — re-running `load` with an unchanged rules file is cheap and safe to repeat.

`cask auto-path load` works in both direct-pg and http-mode environments (see [Loading rules over HTTP](#loading-rules-over-http) below for the http-mode requirements). Other subcommands (`set`, `remove`, `test`, `list`) are direct-pg only.

## Loading rules over HTTP

`POST /api/auto-path/load` bulk-applies rules from a JSON request body shaped exactly like the CLI's rules file (`{ "bucket": [...], "partition": [...] }`). This endpoint is **admin-only** — the requestor must hold the configured admin role (or be the configured super-admin user); a non-admin caller gets a 403. If ACL enforcement is disabled server-wide, the endpoint is open to anyone, matching the rest of the API's behavior in that mode.

```bash
curl -X POST http://localhost:3000/api/auto-path/load \
  -H "Content-Type: application/json" \
  -d @./auto-path-rules.json
```

The response is `{ "results": [{ "name", "type", "updated" }, ...] }` — one entry per rule in the request body, with `updated: false` for any rule that was already up to date and therefore skipped.
