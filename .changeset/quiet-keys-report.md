---
"@inlang/sdk": minor
---

Add `findDuplicateJsonProperties` to `@inlang/sdk/json-formatting` for opt-in diagnostics on strict JSON text before importing translation files. It reports decoded duplicate keys and the source offsets of their first and repeated occurrences, including nested objects and objects in arrays. Callers choose whether to report or reject duplicates. Default imports, last-value behavior, cross-file overlays, and export formatting remain unchanged. Malformed input throws the native `JSON.parse` `SyntaxError`.
