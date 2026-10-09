---
"@inlang/plugin-apple-strings": patch
---

Saving a project no longer rewrites whole `.strings` files. The export keeps the text of every entry that didn't change, the comments, whitespace, order and encoding (UTF-8 or UTF-16) of the file, so that git only shows the edited translations. Changed entries are written in place, new entries are inserted after the entry that precedes them alphabetically, and removed entries are removed together with the comment directly above them.
