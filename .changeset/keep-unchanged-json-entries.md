---
"@inlang/sdk": minor
---

New helpers for plugins in `@inlang/sdk/json-formatting` to keep the text of unchanged entries of JSON translation files.

`keepUnchangedJsonEntries({ exported, files, settings, importFiles, exportFiles })` takes the files of a full export and, for every file that replaces one of `exportFiles`' `files`, keeps the previous text of every entry that didn't change, the key order and the formatting (indentation, line endings, final newline, byte order mark). An entry is unchanged if the plugin writes the same JSON value for it as for what the previous entry imports to (the previous files are imported together, like a project is loaded), so legacy shapes, other escaping and flat keys that the plugin writes nested are kept too. New keys are inserted after the key that precedes them in the full export, removed keys are dropped, and keys the plugin neither imports nor writes are kept. The results are only used if the plugin imports them as the full export; otherwise the full export of a file is written. Files that keep previous text are marked `verbatim`.

`stringifyJsonKeepingEntries({ previous, previousCanonical, next })` is the underlying writer for a single file.
