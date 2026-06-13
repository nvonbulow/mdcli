# Dataview support matrix

This package implements a local Dataview-inspired subset, uses upstream Dataview semantics as reference where listed, and unsupported rows are intentionally deferred rather than silently broken.

## Query types

| Query type | Status | Notes |
| --- | --- | --- |
| `TASK` | Supported | Existing task-record queries; rows expose task fields and remain the backing query type for `kb task ...`. |
| `LIST` | Supported | Page-record queries with zero or one projection; `WITHOUT ID` supported. |
| `TABLE` | Supported | Page-record queries with zero or more projections; `WITHOUT ID` supported. |
| `CALENDAR` | Unsupported | Parser rejects with `Unsupported Dataview query type: CALENDAR`. |

## Data commands and sources

| Command or source | Status | Notes |
| --- | --- | --- |
| `FROM` omitted | Supported | Scans all Markdown files / task records. |
| `FROM "path"` | Supported | Matches an exact vault-relative Markdown path, the same path plus `.md`, or descendants of a folder path. |
| `FROM #tag` | Supported | Matches page `file.tags` / `file.etags` and task `tags`; page subtags expand parent tags. |
| `FROM <source> AND/OR <source>` | Supported | Boolean composition for supported path/tag sources only. |
| `WHERE` | Supported | Repeated predicates are combined as filters. |
| `SORT ... ASC|DESC` | Supported | Multiple sort terms supported. |
| `GROUP BY` | Limited | Group metadata is produced for final rows; full upstream grouped-row aggregation is not implemented. |
| `LIMIT <positive integer>` | Supported | Applied after filtering/sorting and before row construction. |
| `FLATTEN` | Unsupported | No parser support. |
| Link/function sources such as `[[Note]]`, `outgoing(...)`, `incoming(...)` | Unsupported | No parser/source support in this slice. |

## Expressions and functions

| Expression or function | Status | Notes |
| --- | --- | --- |
| Identifiers and dotted identifiers | Supported | Exact field lookup first, then nested object lookup. |
| String, number, and boolean literals | Supported | Literal values are parsed directly. |
| Comparison operators `=`, `!=`, `>`, `>=`, `<`, `<=` | Supported | Parsed into semantic enum values, not stored as rendered tokens. |
| Boolean operators `AND`, `OR`, `!` | Supported | Parsed into semantic enum values. |
| Function calls | Limited | Only registered functions work; currently `contains(...)` and `date(...)`. |
| Arithmetic, lambdas, regex operators, and full Dataview expression catalog | Unsupported | Not implemented in this subset. |

## Record fields

### Page records supported fields

| Field | Status | Notes |
| --- | --- | --- |
| Frontmatter scalar/array/object values | Supported | YAML frontmatter values are exposed as Dataview values. |
| Inline fields | Supported | Page-level inline fields are exposed as Dataview values. |
| Sanitized metadata aliases | Supported | Metadata keys are also available as trimmed, lowercase, whitespace-to-hyphen aliases when different. |
| `file.name` | Supported | Basename without `.md`. |
| `file.folder` | Supported | Directory path without trailing slash, or `""` for root files. |
| `file.path` | Supported | Vault-relative path. |
| `file.ext` | Supported | Always `"md"`. |
| `file.link` | Supported | Vault-relative path. |
| `file.etags` | Supported | Unique explicit tags from Markdown body plus frontmatter `tags`, preserving encounter order. |
| `file.tags` | Supported | Unique expanded tags from `file.etags`, preserving first encounter. |
| `file.outlinks` | Supported | Wikilink targets, preserving encounter order. |
| `file.frontmatter` | Supported | Array of `key | value` strings for scalar frontmatter fields only. |

### Page records unsupported fields

| Field | Status | Notes |
| --- | --- | --- |
| `file.size` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.ctime` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.mtime` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.cday` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.mday` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.inlinks` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.aliases` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.tasks` | Unsupported | Deferred; not provided by the current page-record projection surface. |
| `file.lists` | Unsupported | Deferred; not provided by the current page-record projection surface. |

### Task records supported fields

| Field | Status | Notes |
| --- | --- | --- |
| `task` | Supported | Parsed task model. |
| `text` | Supported | Task text. |
| `completed` | Supported | Completion state. |
| `scheduled` | Supported | Scheduled date. |
| `due` | Supported | Due date. |
| `depends` | Supported | Dependency metadata. |
| `repeat` | Supported | Repeat metadata. |
| `area` | Supported | Area metadata. |
| `project` | Supported | Project metadata. |
| `tags` | Supported | Task-line tags. |
| `path` | Supported | Vault-relative Markdown path. |
| `line` | Supported | Source line number. |
| `file.path` | Supported | Vault-relative Markdown path. |
| `file.link` | Supported | Vault-relative Markdown path. |
| `file.line` | Supported | Source line number. |

## Model representation

Query kind, sort direction, and operators are exported Effect `Schema.Enum` schemas with derived types. AST values store semantic enum values such as `DataviewQueryKind.enums.Table` and `DataviewBinaryOperator.enums.GreaterThanOrEqual`; raw rendered DQL strings and raw TypeScript enums are not part of the AST model.
