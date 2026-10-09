# @inlang/plugin-icu1

## 1.2.0

### Minor Changes

- 61f6018: Keep the plural `offset` on `#`. In `{count, plural, offset:1 … other {You and # others}}`, `#` displays `count - offset`, but it imported as `{$count :icu:pound}` without the offset, so consumers could not format it without finding the enclosing plural. It now imports as `{$count :icu:pound offset=1}`. A `#` inside a nested plural gets the offset of the innermost plural, and a plural without an offset (or `offset:0`) imports as before. Export still writes `#` inside its plural and takes the offset from the plural, so messages round-trip unchanged. A `#` that no longer sits in its plural, for example after an editor removed or changed the plural, exports as what it displays: `{count, number}`, or `{count, plural, offset:1 other {#}}` when it has an offset. A literal `#` in a select nested in a plural is now escaped on export instead of turning into a `#` placeholder.

  This is a minor release because the imported inlang message shape changes for `#` in plurals with an offset.

### Patch Changes

- cde2ca3: Saving a project only changes the entries of the message files that were edited. Unchanged entries keep their text, including the spacing and quoting of ICU messages, and the files keep their key order, indentation and line endings. Exporting large files is also much faster.
- e8321f7: Fix `#` next to selects in plurals, and plurals and selects that repeat an argument.

  - ICU and `intl-messageformat` read `#` in a select nested in a plural as a literal "#". The export wrote a `#` there whenever it moved a select into a plural, e.g. for `{count, plural, one {# item} other {# items}} {gender, select, female {for her} other {}}`, which then displayed "# item for her". A `#` now stays directly in its plural, or exports as the number it displays (`{count, number}`, or `{count, plural, offset:1 other {#}}` with an offset), which also imports back as that `#`. A literal "#" in such a select moves out of the plural with its select where possible, since `'#'` there is no quote for ICU.
  - Plurals on the same argument, type and offset shared one selector, which merged their cases: `{count, plural, one {# file} other {# files}} {count, plural, one {was} other {were}}` displayed "0 files was". A plural nested in or following such a plural now gets its own selector, and sibling plurals export as siblings again. Selects on the same argument merge into one select with the cases each value selects.
  - A selector now follows the selectors it is nested in, also when it occurs first elsewhere in the message.
  - An exact match (`=1`) of a plural no longer pairs with another plural on the same argument with a different offset.
  - Adjacent texts are escaped together, so `#'#` followed by `#` no longer exports as `'#''#''#'`.

- fd59d5a: Fix two export issues around `#` and escaping.

  - A `#` without an offset that the export moved into a nested plural with an `offset` on the same argument, as in `{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}`, exported as a bare `#` there and displayed `n - 1`. It now exports as `{n, number}`.
  - Special characters that are adjacent or separated only by apostrophes are quoted as one segment (`'##'`, `'{}'`, `'#''#'` for `#'#`, `'{''}'` for `{'}`) instead of one by one. ICU reads `'#'` + `''` + `'#'` as one quoted segment in which `''` is one apostrophe, so quoting them one by one read back with an extra apostrophe, which grew on every export. Function styles are escaped the same way.

- ae3d5f0: Export `#` with the offset it displays wherever the export moves it.

  - A `#` without an `offset` option is offset 0 whenever the message has a plural without an offset on its argument, not only when such a plural encloses it. A select under a plural with an offset can move an offset-0 `#` out of its own plural: in `{count, plural, offset:1 other {{gender, select, male {{count, plural, other {# x}}} other {{count, plural, other {# y}}}}}}`, count 2 displayed "1 x". It now displays "2 x".
  - A `#` imported before 1.2.0 has no `offset` option even in a plural with an offset. When all plurals of the message on its argument have an offset, it takes the offset of the plural it sits in, or, outside of one (moved out by a select, in a plural on another argument, or after an editor removed its plural), the offset of the plural on its argument, instead of exporting as `{count, number}`. Plurals of other locales of the bundle no longer affect this.

- 4ecf2bd: Deleting every message of a translation file now persists. If all messages of a locale (or of an i18next namespace of a locale) were deleted, the export had nothing to write for that file, so `saveProjectToDirectory` left it on disk as it was, and the deleted messages came back on the next load.

  The plugin contract of `exportFiles` with `files` is extended: a plugin also returns a file for every previous file that the project read, that holds messages the project no longer has and that the export doesn't otherwise write, without those messages. Whether the project read a file is the new `ExistingFile.imported`: `saveProjectToDirectory` sets it for files whose content is what `loadProjectFromDirectory` imported or what a save wrote. A file the project never read (e.g. of a locale added to the settings after loading, or changed on disk since) is never emptied; hosts that can't tell leave `imported` out. `keepUnchangedJsonEntries` does this for the JSON plugins (message-format, i18next, json, next-intl, icu1, apple-xcstrings): every key that imports to a message is removed (walking into objects that hold messages), everything else (`$schema`, keys the plugin doesn't read) and the formatting stay, so a file whose messages were all deleted becomes `{}`, or `{ "$schema": … }`. The file is kept, not deleted: the plugin still lists it for the locale, the next message of the locale goes there, and tools may expect it. The previous file's `path` is the exported file's `name` and its `metadata.pathPattern`, so `saveProjectToDirectory` writes it to exactly that file, also one of a `pathPattern` array; other hosts that pass `files` should write a file with a `metadata.pathPattern` there too. Files that hold no deleted message (e.g. an empty file, or an i18next namespace whose messages another namespace overrides) stay byte-identical.

  `@inlang/plugin-apple-strings` writes the `.strings` file of such a locale without its entries and their comments; other comments (e.g. a license header) stay. `@inlang/plugin-android` writes the `strings.xml` of such a locale without its messages; elements it doesn't import (non-translatable strings, `<string-array>`s, …) and heading comments stay. This includes the base locale's `values/strings.xml`: deleting every message of the base locale removes Android's default strings, so the app needs other default resources. If such a file can't be written without removing elements the plugin doesn't import, it is left as it is instead of failing the export.

  A file counts as read only as the locale (and namespace) it was read or written as, so a file that a settings change assigns to another locale (e.g. a new base locale for `values/`) is not emptied.

- abfd521: `keepUnchangedJsonEntries` now checks the kept files in the order a project load reads them. Its safety net re-imports the files as they will be on disk and only keeps their text if they read like the full export, but it read the exported files in the order the plugin returned them and the files the export doesn't replace after them. When two files have the same message (e.g. overlapping i18next namespaces), the file read last wins, so a different order could accept kept text with a stale copy of an edited message, and the edit was lost on the next load. The files are now read in the order of `files` (`toBeImportedFiles`, like `loadProjectFromDirectory`), an exported file at the place of the file it replaces (at every place for several files of a `pathPattern` array, which the host writes it to); a new file (no place known yet) before the next exported file of its locale that has a place, so plugins that export in load order like i18next keep their order, else last. The JSON plugins bundle the helper.
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

## 1.1.1

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- Updated dependencies [68eefaf]
- Updated dependencies [56891d6]
- Updated dependencies [5df91b6]
  - @inlang/sdk@3.1.0

## 1.1.0

### Minor Changes

- b16efc3: Lower ICU exact `plural` and `selectordinal` cases through a dedicated exact selector during import, while keeping category cases on the plural selector. This keeps exact `=n` arms reachable with the existing Paraglide compiler and serializes the imported shape back to normal ICU `=n` syntax on export.

  This is a minor release because the imported inlang message shape changes for ICU exact plural and ordinal cases.

## 1.0.1

### Patch Changes

- 6defee0: Handle markup elements explicitly in the ICU1 serializer after SDK pattern type updates.

  - Updated serializer type handling for widened pattern unions.
  - Added an explicit user-facing error when markup placeholders are encountered, since ICU MessageFormat 1 does not support markup placeholders.

## 1.0.0

### Major Changes

- 2572cb5: Initial release
