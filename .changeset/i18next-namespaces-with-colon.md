---
"@inlang/plugin-i18next": patch
---

Namespaces with `:` in their name (e.g. `"app:errors"` in `pathPattern`) are saved to their own file. Before, the bundle id `app:errors:notFound` was split at its first `:` and written as the key `errors:notFound` of a namespace `app`: to the file of another namespace, or to a file outside the project's `pathPattern`, while the namespace's own file kept the old texts, so edits were lost on the next load. The namespace of a bundle id is now the namespace of `pathPattern` that the id starts with. If two namespaces match, like `a` and `a:b` for `a:b:c` (the key `b:c` of `a` and the key `c` of `a:b` have the same bundle id), the message stays in the namespace whose files have it (also when its plural or context forms change, and a new translation goes there too), and a new message goes to the longer namespace, `a:b`. If both files have the key, the file read last wins as when loading the project; edits are written to it, and the other file keeps its text. Deleting such a message removes it from both files, which are then written in full.

Every `{locale}` of a `pathPattern` is replaced when files are read, as when they are saved, so a pattern like `./{locale}/common.{locale}.json` reads the file it writes.
