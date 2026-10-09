# @inlang/plugin-apple-strings

## 0.2.8

### Patch Changes

- 4ecf2bd: Exporting with the existing file no longer rewrites the whole file when a removed block between empty lines is followed by a removed last block of the file. Both removals took the empty line between them, the edits overlapped, and the plugin fell back to the full export. They are now joined.
- d12bbd3: Saving a project no longer rewrites whole `.strings` files. The export keeps the text of every entry that didn't change, the comments, whitespace, order and encoding (UTF-8 or UTF-16) of the file, so that git only shows the edited translations. Changed values are written in place, new entries are inserted after the entry that precedes them alphabetically, and removed entries are removed together with a comment that belongs only to them (headings of groups stay).
- 4ecf2bd: Deleting every message of a translation file now persists. If all messages of a locale (or of an i18next namespace of a locale) were deleted, the export had nothing to write for that file, so `saveProjectToDirectory` left it on disk as it was, and the deleted messages came back on the next load.

  The plugin contract of `exportFiles` with `files` is extended: a plugin also returns a file for every previous file that the project read, that holds messages the project no longer has and that the export doesn't otherwise write, without those messages. Whether the project read a file is the new `ExistingFile.imported`: `saveProjectToDirectory` sets it for files whose content is what `loadProjectFromDirectory` imported or what a save wrote. A file the project never read (e.g. of a locale added to the settings after loading, or changed on disk since) is never emptied; hosts that can't tell leave `imported` out. `keepUnchangedJsonEntries` does this for the JSON plugins (message-format, i18next, json, next-intl, icu1, apple-xcstrings): every key that imports to a message is removed (walking into objects that hold messages), everything else (`$schema`, keys the plugin doesn't read) and the formatting stay, so a file whose messages were all deleted becomes `{}`, or `{ "$schema": … }`. The file is kept, not deleted: the plugin still lists it for the locale, the next message of the locale goes there, and tools may expect it. The previous file's `path` is the exported file's `name` and its `metadata.pathPattern`, so `saveProjectToDirectory` writes it to exactly that file, also one of a `pathPattern` array; other hosts that pass `files` should write a file with a `metadata.pathPattern` there too. Files that hold no deleted message (e.g. an empty file, or an i18next namespace whose messages another namespace overrides) stay byte-identical.

  `@inlang/plugin-apple-strings` writes the `.strings` file of such a locale without its entries and their comments; other comments (e.g. a license header) stay. `@inlang/plugin-android` writes the `strings.xml` of such a locale without its messages; elements it doesn't import (non-translatable strings, `<string-array>`s, …) and heading comments stay. This includes the base locale's `values/strings.xml`: deleting every message of the base locale removes Android's default strings, so the app needs other default resources. If such a file can't be written without removing elements the plugin doesn't import, it is left as it is instead of failing the export.

  A file counts as read only as the locale (and namespace) it was read or written as, so a file that a settings change assigns to another locale (e.g. a new base locale for `values/`) is not emptied.

- Updated dependencies [5c0a84b]
- Updated dependencies [2390c5a]
- Updated dependencies [f45a761]
- Updated dependencies [356a50a]
- Updated dependencies [ad469a7]
- Updated dependencies [fa0777c]
- Updated dependencies [94cf565]
- Updated dependencies [691caec]
- Updated dependencies [4ecf2bd]
- Updated dependencies [b38facf]
- Updated dependencies [abfd521]
- Updated dependencies [56923c5]
- Updated dependencies [b0d8a4f]
- Updated dependencies [fb83c18]
- Updated dependencies [3e9bd54]
  - @inlang/sdk@4.0.0

## 0.2.7

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- Updated dependencies [68eefaf]
- Updated dependencies [56891d6]
- Updated dependencies [5df91b6]
  - @inlang/sdk@3.1.0

## 0.2.6

### Patch Changes

- Updated dependencies [924dd7e]
  - @inlang/sdk@3.0.6

## 0.2.5

### Patch Changes

- Updated dependencies [c73ed13]
- Updated dependencies [59715d2]
  - @inlang/sdk@3.0.5

## 0.2.4

### Patch Changes

- Updated dependencies [c81ef61]
  - @inlang/sdk@3.0.4

## 0.2.3

### Patch Changes

- Updated dependencies [3c1fbc6]
  - @inlang/sdk@3.0.3

## 0.2.2

### Patch Changes

- Updated dependencies [b012f5e]
  - @inlang/sdk@3.0.2

## 0.2.1

### Patch Changes

- Updated dependencies [78ad386]
  - @inlang/sdk@3.0.1

## 0.2.0

### Minor Changes

- 85d79c5: Add first-class Android XML and Apple `.strings` import/export plugins using the Inlang v2 message model. Android supports positional variables and CLDR plurals; Apple `.strings` supports plain messages and positional variables and rejects selectors that the format cannot represent.

### Patch Changes

- Updated dependencies [fb46551]
- Updated dependencies [aaf4e05]
- Updated dependencies [5d7b021]
- Updated dependencies [7ea66f8]
  - @inlang/sdk@3.0.0
