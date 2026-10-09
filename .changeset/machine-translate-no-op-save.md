---
"@inlang/cli": patch
---

`machine translate` no longer rewrites the translation files when nothing was translated. Before, it always re-exported every file, which could reformat files in git without any new translation. When translations are added, the files are still exported as before.
