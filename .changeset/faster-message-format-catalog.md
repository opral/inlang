---
"@inlang/plugin-message-format": patch
---

Import ordinary flat text and input placeholders directly into the SDK's validated read-only catalog. The optional `importFilesV2` hook avoids temporary rows and duplicated AST construction; complex syntax, nested catalogs, repeated locale paths, and older SDKs retain the ordinary importer. Also reduce redundant parsing and declaration allocations in that importer.

With the same unreleased SDK build, local three-locale catalog loading fell from 101 ms to 32 ms for 6,400 keys and from 186 ms to 56 ms for 13,300 keys when using the updated plugin (68–70% less time). These are three-trial fresh-process medians with module imports excluded. Logical catalog hashes matched; results depend on the project and machine. See `packages/sdk/benchmarks/catalog/round2`.

A separate five-trial ablation holds the updated plugin constant: `importFilesV2` reduced import plus catalog assembly from 57 ms to 28 ms for 6,400 keys and from 111 ms to 45 ms for 13,300 keys (50–59% less time). This isolates the new path from earlier parser improvements and excludes filesystem reads, plugin loading, code generation, and output writes. The final catalog still contains the full pattern AST. See `packages/sdk/benchmarks/catalog/import-files-v2` for payload controls, CPU profiles, and limitations.
