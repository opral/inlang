---
"@inlang/plugin-i18next": patch
---

Saving a project no longer rewrites whole translation files. Only the entries of edited, added or removed messages change; every other entry keeps its text (escapes, `{{ name }}` spacing), key order and formatting (indentation, line endings, final newline), so diffs in git show just the edits. New keys are inserted after the key that precedes them in the export. Files without a previous version (e.g. a new locale), and previous files that are not valid JSON, are written whole as before. Exports of large projects are also faster.
