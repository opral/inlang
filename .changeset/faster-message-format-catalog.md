---
"@inlang/plugin-message-format": patch
---

Import ordinary flat text and input placeholders directly into the SDK's validated read-only catalog. The optional `tryImportCatalog` hook avoids temporary rows and duplicated AST construction; complex syntax, nested catalogs, repeated locale paths, and older SDKs retain the ordinary importer. Also reduce redundant parsing and declaration allocations in that importer.

With the same unreleased SDK build, local three-locale catalog loading fell from 101 ms to 32 ms for 6,400 keys and from 186 ms to 56 ms for 13,300 keys when using the updated plugin (68–70% less time). These are three-trial fresh-process medians with module imports excluded. Logical catalog hashes matched; results depend on the project and machine. See `packages/sdk/benchmarks/catalog/round2`.
