---
"@inlang/plugin-android": patch
"@inlang/plugin-apple-strings": patch
---

Exporting with the existing file no longer rewrites the whole file when a removed block between empty lines is followed by a removed last block of the file. Both removals took the empty line between them, the edits overlapped, and the plugin fell back to the full export. They are now joined.
