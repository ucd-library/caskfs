# Auto Path Rules

Auto Path Rules allow for automatic assignment of partition keys and bucket names based on file paths. This feature is particularly useful for segmenting data or storage supporting multiple different requirements.

## Key Features
- **Path-Based Rules**: Define rules that match specific path patterns to assign partition keys and bucket names automatically.

## Auth Path Definitions
An auto path rule consists of:
 - **name** (string) - Required. A unique name for the auto path rule.
 - **type** (string) - Required. Either `partitionKey` or `bucket`.
 - **filterRegex** (string) - Required. A regular expression pattern to match against file path parts.
 - **positionIndex** (number) - Optional. Position index to match against.  Otherwise all parts of the path are matched.
 - **getValue** (function) - Optional. JavaScript function to extract the partition key from the matched path part.  Otherwise, the entire matched path part is used as the partition key.  The function is passed the following argument:
   - **name** (string): The name of the auto path rule.
   - **pathValue** (string): The matched path part.
   - **regexMatch** (string): The full regex match result of JavaScripts `String.match` function.

The resulting value will be the `name`-`pathValue` unless a custom function is provided to extract a different value.

Custom JavaScript getValue function example:

With the following auto path rule:
```json
{
  "name": "collection",
  "pattern": "^dams-(.+)-metadata$",
}
```

The following function will extract just the collection name from the matched path part:
```javascript
return 'collection-'+regexMatch[1];
```