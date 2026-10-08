---
"@inlang/sdk": minor
"@inlang/plugin-m-function-matcher": minor
---

Add browser-compatible `checkProject`, `applyFix` and `findUsages` APIs for missing and empty translations, translation checks against a reference locale (missing or unknown variables, missing markup, missing plural/select variants), unused messages and usage locations. Checks expose serializable fixes, explicit analysis status, optional bundle scopes and intentional fallback exclusions. Deletion fixes rerun usage analysis and verify the bundle's revision inside an atomic transaction before removing all locales and variants.

Plugins can implement `analyzeUsage`; the m-function matcher analyzes ESM JavaScript, JSX, TypeScript, TSX and Svelte source with conservative handling of dynamic references, namespace escapes, parse failures and unsupported formats. Unresolved analysis withholds unused diagnostics and deletion fixes. Analyzers can return source `references`, which `findUsages` exposes for code previews and "find references". `checkTranslation()` runs the translation checks on unsaved input, and `checkBundle()` checks one in-memory bundle synchronously for editors that keep bundles in memory.
