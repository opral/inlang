---
"@inlang/sdk": minor
---

Add `loadProjectCatalog({ path, fs })` for loading detached settings and nested translation bundles without opening Lix, creating watchers, or updating project metadata. Import it from `@inlang/sdk/catalog` to avoid loading database modules. Existing editable project APIs remain supported. Remote plugin caches remain read-only unless `writePluginCache: true` is supplied.

Plugins can optionally implement `importFilesV2` using an SDK-owned scalar sink. This constructs validated AST nodes once, without temporary storage rows and a second AST copy. Unsupported imports retain the existing importer. Generated row IDs are opaque, ephemeral snapshot references; explicit plugin identities and translation keys are preserved.

On a local three-locale benchmark, compiler-ready loading fell from 3,075 ms to 101 ms for 6,400 keys and from 5,969 ms to 186 ms for 13,300 keys using the same message-format plugin (about 97% less time). With the updated plugin's scalar importer, those catalog loads took 32 ms and 56 ms (about 99% less time than the editable-project loader plus nested query). These are medians of three serial fresh-process trials; module imports and cleanup are recorded separately, and logical catalog contents matched. See `packages/sdk/benchmarks/catalog/round2` for raw results and limits. No incremental compilation is involved.
