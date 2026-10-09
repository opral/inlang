---
"@inlang/sdk": minor
---

`exportFiles` receives the files it overwrites, so that plugins can keep the text of unchanged entries.

- The plugin API's `exportFiles` has a new optional argument `files`: the current content of the files that `toBeImportedFiles` lists, as `{ path, locale, content, metadata? }` (type `ExistingFile`). Only files that exist are passed. Plugins that ignore it work as before, and plugins that use it still work on hosts that don't pass it.
- `saveProjectToDirectory` reads the files of `toBeImportedFiles` from disk and passes them to `exportFiles`.
- `project.exportFiles({ pluginKey, files })` passes `files` through, for apps that write the exported files themselves.
- `ExportFile` has a new optional `verbatim` flag. A plugin sets it on a file that keeps the formatting of the existing file, and `saveProjectToDirectory` writes it byte for byte instead of re-indenting the JSON like the existing file. Output without the flag is re-indented as before.
- `saveProjectToDirectory` no longer rewrites a file whose content didn't change, and keeps the byte order mark of a JSON file it re-indents (before, such files were minified).
