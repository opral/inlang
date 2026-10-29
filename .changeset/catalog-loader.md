---
"@inlang/sdk": minor
---

Add `createCatalogLoader({ path, fs? })` from `@inlang/sdk/catalog` for stateful directory loading without opening a database. Call `load()` repeatedly: the first load and settings/plugin changes return a complete `reset`; later loads return an `update` containing complete changed bundles and removed bundle IDs. All locales and the full pattern AST are preserved. The unreleased snapshot API is replaced rather than retained as a compatibility alias.

Each loader owns source-byte and bundle-fingerprint caches. Unchanged inputs skip plugin import and normalization for a single ordinary importer. Loads are serialized, returned ASTs do not alias cache state, and importer/resource failures retain the last successful state. Existing `importFiles()` and legacy plugins remain supported. Remote plugin caches are read-only unless `writePluginCache: true` is supplied; no project metadata is written.

In a local three-locale SDK-only benchmark, unchanged reloads fell from 40.3 ms to 1.4 ms at 6,400 keys and from 103.2 ms to 2.3 ms at 13,300 keys (97–98% less time). A single translation edit returns one complete bundle instead of all 13,300. Edited resources still use the ordinary full importer: at 13,300 keys the first edited reload measured 132.6 ms versus 79.3 ms for the previous snapshot API, and an input edit measured 94.3 ms versus 80.0 ms. This refactor establishes change batches; it does not claim the incremental-parser prototype's speedup or end-to-end compiler improvement. Figures are medians of five serial, rotated fresh-process trials on Node 24.22.1, with identical plugin code and final AST equality checks. See `packages/sdk/benchmarks/catalog/stateful` for raw results, validation and limitations.
