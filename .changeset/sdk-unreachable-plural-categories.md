---
"@inlang/sdk": patch
---

Translation checks skip variants for a plural category the locale never selects. i18next's `_zero` is imported as an exact `count=0` form and a `countPlural=zero` form; German, English or French never select `zero`, so its form no longer gets `missing-variable {count}` (or `unknown-variable`, `missing-markup`, `empty-variant`) diagnostics, and the reference locale checked against itself stays clean. Categories the locale does select keep every check (Latvian `zero` still needs `{count}`). New export: `isUnreachableVariant(variant, declarations, locale)`.
