---
"@inlang/sdk": minor
---

Add `loadProjectCatalog({ path, fs })` for loading detached settings and nested translation bundles without opening Lix, creating watchers, or updating project metadata. Import it from `@inlang/sdk/catalog` to avoid loading database modules. Existing editable project APIs remain supported. Remote plugin caches remain read-only unless `writePluginCache: true` is supplied.

Catalog loading uses plugins' existing `importFiles()` API, including the complete message model. No new plugin hook or sink API is introduced. Generated row IDs are opaque, ephemeral snapshot references; explicit plugin identities and translation keys are preserved.

On a local three-locale benchmark using the same message-format plugin, compiler-ready loading fell from 3,075 ms to 101 ms for 6,400 keys and from 5,969 ms to 186 ms for 13,300 keys (about 97% less time). These are medians of three serial fresh-process trials; module imports and cleanup are recorded separately, and logical catalog contents matched. See `packages/sdk/benchmarks/catalog/round2` for the recorded baseline and benchmark limitations. No incremental compilation is involved.
