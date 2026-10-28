---
"@inlang/sdk": minor
---

Add `loadProjectCatalog({ path, fs })` to load settings and nested translation bundles directly through the existing plugins without opening Lix. The result is a detached snapshot with diagnostics, without database handles, watchers, or project metadata writes. Existing editable project APIs remain supported. Remote plugin caches are read-only by default; `writePluginCache: true` saves downloaded modules for later offline loads.

In a local benchmark with three locales, loading compiler-ready settings and nested bundles took 0.25 s instead of 3.20 s for 6,400 keys (92% less time, 12.8× faster), and 0.51 s instead of 5.96 s for 13,300 keys (91% less time, 11.7× faster). These are medians of three serial fresh-process trials comparing both APIs from the same SDK build; the editable-project measurement includes selecting nested bundles. Module imports and project cleanup are measured separately. Catalog contents matched after excluding generated storage IDs. See `packages/sdk/benchmarks/catalog` for methodology and raw measurements.
