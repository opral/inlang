---
"@inlang/plugin-i18next": patch
---

Saving a project no longer rewrites whole translation files. Only the entries of edited, added or removed messages change; every other entry keeps its text (escapes, `{{ name }}` spacing), key order and formatting (indentation, line endings, final newline), so diffs in git show just the edits. New keys are inserted after the key that precedes them in the export. Files without a previous version (e.g. a new locale), and previous files that are not valid JSON, are written whole as before. Exports of large projects are also faster.

Keys with `:` are exported as they are imported: in a project with one file per locale (`pathPattern` is a string), `"err:notFound"` stays a key of the locale file instead of becoming a namespace `err`, which made saving overwrite the whole file with that one key. With namespaces, only the first `:` separates the namespace, so `common:err:notFound` is written as the key `err:notFound` of `common` instead of `err`.
