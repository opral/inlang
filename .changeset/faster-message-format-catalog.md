---
"@inlang/plugin-message-format": patch
---

Speed up the existing `importFiles()` implementation by avoiding redundant pattern serialization and parsing, flattening of already-flat catalogs, and unnecessary declaration and variant allocations. The plugin API and support for complex messages remain unchanged.

In a local three-locale benchmark using the same read-only SDK loader, loading with the updated ordinary importer took 66 ms instead of 113 ms for 6,400 keys and 145 ms instead of 258 ms for 13,300 keys (42–44% less loading time). These are five-trial fresh-process medians with SDK module imports, code generation, and output writes excluded. See `packages/sdk/benchmarks/catalog/round3/no-v2` for raw data and scope.
