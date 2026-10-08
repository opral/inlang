---
"@inlang/sdk": minor
"@inlang/plugin-m-function-matcher": minor
---

Add browser-compatible `checkProject` and `applyFix` APIs for missing translations and unused messages. Checks expose serializable fixes, explicit analysis status, optional bundle scopes and intentional fallback exclusions. Deletion fixes rerun usage analysis and verify the bundle's revision inside an atomic transaction before removing all locales and variants.

Plugins can implement `analyzeUsage`; the m-function matcher analyzes ESM JavaScript, JSX, TypeScript, TSX and Svelte source with conservative handling of dynamic references, namespace escapes, parse failures and unsupported formats. Unresolved analysis withholds unused diagnostics and deletion fixes.
