---
"@inlang/sdk": minor
---

`exportFiles` receives the files it overwrites, so that plugins can keep the text of unchanged entries.

- The plugin API's `exportFiles` has a new optional argument `files`: the current content of the files that `toBeImportedFiles` lists, as `{ path, locale, content, metadata? }` (type `ExistingFile`). Only files that exist are passed. Plugins that ignore it work as before, and plugins that use it still work on hosts that don't pass it.
- `saveProjectToDirectory` reads the files of `toBeImportedFiles` from disk and passes them to `exportFiles`.
- `project.exportFiles({ pluginKey, files })` passes `files` through, for apps that write the exported files themselves.
- `saveProjectToDirectory` writes an exported JSON file as is if it already has the indentation and final newline of the existing file. Before, it always re-stringified it, which undid a plugin's choice to keep entries of the existing file as they were. Output with other indentation is still indented like the existing file.
