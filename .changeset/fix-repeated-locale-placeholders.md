---
"@inlang/plugin-message-format": patch
---

Replace every `{locale}` and legacy `{languageTag}` placeholder when resolving resource paths, so catalogs with the locale in both a directory and filename are imported correctly.
