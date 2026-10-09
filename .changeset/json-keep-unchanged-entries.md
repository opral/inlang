---
"@inlang/plugin-json": patch
---

Saving a project only changes the entries of the message files that were edited. Unchanged entries keep their text, and the files keep their key order, nesting, indentation and line endings, also with namespaced `pathPattern`s. Exporting large files is also faster.
