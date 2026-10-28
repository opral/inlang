# Optimized read-only catalog loading

Local macOS arm64, Node 22.21.1, 2026-10-28. Three serial fresh processes per
backend and size, rotated order. Inputs contain three locales (en/de/fr), flat
keys, and one username input per message. Files are created immediately before
timing, so filesystem caches are warm. No incremental/watch work is measured.

| Keys ×3 locales | Editable project + nested query | Catalog, frozen plugin | Catalog, updated plugin |
| --------------- | ------------------------------: | ---------------------: | ----------------------: |
| 6,400           |                        3,075 ms |                 101 ms |                   32 ms |
| 13,300          |                        5,969 ms |                 186 ms |                   56 ms |

Every case uses the same SDK build. `project` and `catalog` use the frozen
message-format 4.5.5 artifact; `catalog-optimized` uses this PR's plugin. The first
comparison isolates the loader API. The second measures the updated plugin and
its scalar catalog protocol with that same loader. Do not attribute the entire
combined improvement to either component alone. Module import and project close
times are recorded separately; fixture creation, canonical hashing, and cleanup
are excluded. The immutable string values are validated and the SDK owns the
constructed AST; this does not remove validation or editable-project semantics.

`results.jsonl` contains all 18 cases. `summary.json` has medians and ranges.
Logical catalog hashes match across all backends at each size after excluding
opaque generated storage identities. `provenance.json` identifies source bases,
measured dirty working trees, built JavaScript fingerprints, and plugin hashes.
The optimized source is the source included in this PR, rather than its earlier
base commit alone. The API and plugin remain unreleased.

```sh
CATALOG_BENCH_PLUGIN=/absolute/path/to/frozen-message-format/index.js \
CATALOG_BENCH_OPTIMIZED_PLUGIN=/absolute/path/to/updated-message-format/dist/index.js \
  node packages/sdk/benchmarks/catalog/round2/run.mjs > results.jsonl
```

Build the SDK and updated message-format plugin first. The wrapper uses the
existing `../run.mjs` worker with explicit plugin selection. Preserve the frozen
artifact; rebuilding it would change the control. These local synthetic results
are not claims about every plugin, cold disks, complete CLI startup, or browser
runtime performance.

Use `import { loadProjectCatalog } from '@inlang/sdk/catalog'` for the lightweight
entry point. The scalar and fresh catalog paths load neither Lix nor UUID; the
generic importer loads UUID lazily and retains its existing UUIDv7 identities.
This changes runtime loading, not installed dependency requirements.
