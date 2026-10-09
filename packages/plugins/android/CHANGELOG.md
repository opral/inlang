# @inlang/plugin-android

## 0.2.8

### Patch Changes

- 4ecf2bd: Exporting with the existing file no longer rewrites the whole file when a removed block between empty lines is followed by a removed last block of the file. Both removals took the empty line between them, the edits overlapped, and the plugin fell back to the full export. They are now joined.
- 7c287ba: Saving a project no longer rewrites whole `strings.xml` files. The export keeps the text of every `<string>` and plural item that didn't change, the XML declaration, comments, whitespace, order, and elements the plugin doesn't import (e.g. `<string-array>`, `<color>`), so that git only shows the edited translations. Changed elements are written in place, new ones are inserted after the element that precedes them in the plugin's order, and removed ones are removed together with a comment that belongs only to them (headings of groups stay).
- 6205436: Importing real-world `strings.xml` files no longer fails on `translatable="false"`, `tools:` attributes (e.g. `tools:ignore="MissingTranslation"`) or `formatted="false"`.

  - Non-translatable strings and plurals (app name, URLs, API keys) are not imported as messages, so they are never written to the files of other locales, also not when another locale has a message with their name. `translatable` and `formatted` are read like Android reads booleans (`false`, `FALSE`, `False`).
  - `formatted="false"` strings are read as text, so a raw `%` (e.g. `Save 50% on %s`) works, and text that would read as a placeholder is written with `formatted="false"`.
  - `formatted="false"` on `<plurals>` is honored the same way. In a plural with placeholders, every item is a format string as Android formats it: `%%` reads as `%`, and a `%` in text is written `%%`, so text such as `lots of %d` in an item no longer turns into a placeholder.
  - A `<string>` and a `<plurals>` may share a name if at most one of them is translatable, and non-translatable product variants (`product="tablet"`) are accepted.
  - Locales with a region use the qualifier Android Studio writes: `pt-BR` is read from and written to `values-pt-rBR/` (previously `values-b+pt+BR/`, which is still read and, if it exists, written). Scripts and numeric regions keep BCP 47 (`values-b+zh+Hans/`, `values-b+es+419/`). The legacy `values-iw/`, `values-in/` and `values-ji/` are read and written too. Every `{locale}` of the `pathPattern` is replaced.
  - An empty `<resources></resources>` or `<resources/>` (a locale without translations yet) imports as no messages instead of failing.
  - With a host that passes the existing files to the export (inlang SDK 4), saving keeps non-translatable resources byte for byte, edited strings and plural items (also self-closing ones) keep their attributes, and the files are written to their Android paths: `saveProjectToDirectory` wrote them to `res/valuesen/strings.xml` and `res/valuesde/strings.xml` instead of `res/values/` and `res/values-de/`. Hosts without the existing files (inlang SDK 3) write the whole-file export where they did before. If an existing file can't be kept and the whole-file export would delete resources the plugin doesn't import, the export fails with an error instead of deleting them.

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
