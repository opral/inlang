---
"@inlang/plugin-i18next": patch
---

Namespaces with `:` in their name (e.g. `"app:errors"` in `pathPattern`) are saved to their own file. Before, the bundle id `app:errors:notFound` was split at its first `:` and written as the key `errors:notFound` of a namespace `app`: to the file of another namespace, or to a file outside the project's `pathPattern`, while the namespace's own file kept the old texts, so edits were lost on the next load. The namespace of a bundle id is now the longest namespace of `pathPattern` that the id starts with. If two namespaces match, like `a` and `a:b` for `a:b:c` (the key `b:c` of `a` and the key `c` of `a:b` have the same bundle id), the message is written to `a:b`.

Every `{locale}` of a `pathPattern` is replaced when files are read, as when they are saved, so a pattern like `./{locale}/common.{locale}.json` reads the file it writes.
