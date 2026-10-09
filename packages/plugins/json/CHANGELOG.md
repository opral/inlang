# @inlang/plugin-json

## 5.1.59

### Patch Changes

- 17bedc9: Saving a project only changes the entries of the message files that were edited. Unchanged entries keep their text, and the files keep their key order, nesting, indentation and line endings, also with namespaced `pathPattern`s. Exporting large files is also faster.
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

## 5.1.58

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- 56891d6: Remove deprecated dependencies so installing the JSON and next-intl plugins no longer pulls in legacy inlang and Lix packages. JSON formatting and existing plugin behavior are preserved.
- Updated dependencies [68eefaf]
- Updated dependencies [56891d6]
- Updated dependencies [5df91b6]
  - @inlang/sdk@3.1.0

## 5.1.57

### Patch Changes

- 27a9a79: Add the modern resource-plugin contract while retaining the legacy JSON API.
  This enables plugin-driven file watching, including namespaced JSON resources.

## 5.1.55

### Patch Changes

- @inlang/sdk@0.36.3

## 5.1.54

### Patch Changes

- Updated dependencies [2fc5feb]
  - @inlang/sdk@0.36.2

## 5.1.53

### Patch Changes

- Updated dependencies [1077e06]
  - @inlang/sdk@0.36.1

## 5.1.52

### Patch Changes

- Updated dependencies [8ec7b34]
- Updated dependencies [05f9282]
  - @inlang/sdk@0.36.0

## 5.1.51

### Patch Changes

- Updated dependencies [8e9fc0f]
  - @inlang/sdk@0.35.9

## 5.1.50

### Patch Changes

- Updated dependencies [da7c207]
  - @inlang/sdk@0.35.8

## 5.1.49

### Patch Changes

- Updated dependencies [2a5645c]
  - @inlang/sdk@0.35.7

## 5.1.48

### Patch Changes

- Updated dependencies [9d2aa1a]
  - @inlang/sdk@0.35.6

## 5.1.47

### Patch Changes

- Updated dependencies [64e30ee]
  - @inlang/sdk@0.35.5

## 5.1.46

### Patch Changes

- @inlang/sdk@0.35.4

## 5.1.45

### Patch Changes

- @inlang/sdk@0.35.3

## 5.1.44

### Patch Changes

- @inlang/sdk@0.35.2

## 5.1.43

### Patch Changes

- @inlang/sdk@0.35.1

## 5.1.42

### Patch Changes

- Updated dependencies [ae47203]
  - @inlang/sdk@0.35.0

## 5.1.41

### Patch Changes

- Updated dependencies [d27a983]
- Updated dependencies [a27b7a4]
  - @inlang/sdk@0.34.10

## 5.1.40

### Patch Changes

- Updated dependencies [a958d91]
  - @inlang/sdk@0.34.9

## 5.1.39

### Patch Changes

- Updated dependencies [10dbd02]
  - @inlang/sdk@0.34.8

## 5.1.38

### Patch Changes

- Updated dependencies [5209b81]
  - @inlang/sdk@0.34.7

## 5.1.37

### Patch Changes

- Updated dependencies [f38536e]
  - @inlang/sdk@0.34.6

## 5.1.36

### Patch Changes

- Updated dependencies [b9eccb7]
  - @inlang/sdk@0.34.5

## 5.1.35

### Patch Changes

- Updated dependencies [2a90116]
  - @inlang/sdk@0.34.4

## 5.1.34

### Patch Changes

- c3c5c59: update documentation

## 5.1.33

### Patch Changes

- Updated dependencies [bc17d0c]
  - @inlang/sdk@0.34.3

## 5.1.32

### Patch Changes

- 1abcc3f: update docs

## 5.1.31

### Patch Changes

- Updated dependencies [3c959bc]
  - @inlang/sdk@0.34.2

## 5.1.30

### Patch Changes

- @inlang/sdk@0.34.1

## 5.1.29

### Patch Changes

- Updated dependencies [5b8c053]
  - @inlang/sdk@0.34.0

## 5.1.28

### Patch Changes

- cd9a3e1: add internal links
  - @inlang/sdk@0.33.1

## 5.1.27

### Patch Changes

- Updated dependencies [d573ab8]
  - @inlang/sdk@0.33.0

## 5.1.26

### Patch Changes

- Updated dependencies [bc9875d]
  - @inlang/sdk@0.32.0

## 5.1.25

### Patch Changes

- Updated dependencies [c068dd2]
  - @inlang/sdk@0.31.0

## 5.1.24

### Patch Changes

- Updated dependencies [9b26a31]
  - @inlang/sdk@0.30.0

## 5.1.23

### Patch Changes

- Updated dependencies [62dfa26]
  - @inlang/sdk@0.29.0

## 5.1.22

### Patch Changes

- @inlang/sdk@0.28.3

## 5.1.21

### Patch Changes

- 923a4bb: fix discord link

## 5.1.20

### Patch Changes

- @inlang/sdk@0.28.2

## 5.1.19

### Patch Changes

- @inlang/sdk@0.28.1

## 5.1.18

### Patch Changes

- Updated dependencies [1e43ae4]
  - @inlang/sdk@0.28.0

## 5.1.17

### Patch Changes

- f3b0489: fix typo

## 5.1.16

### Patch Changes

- 4837297: File locking for concurrent message updates through the load/store plugin api
  Auto-generated human-IDs and aliases - only with experimental: { aliases: true }
- Updated dependencies [4837297]
  - @inlang/sdk@0.27.0

## 5.1.15

### Patch Changes

- @inlang/sdk@0.26.5

## 5.1.14

### Patch Changes

- 960f8fb70: rename the vscode extension to "Sherlock"
  - @inlang/sdk@0.26.4

## 5.1.13

### Patch Changes

- d9cf66170: update docs for apps and plugins
- b7344152a: updated the docs

## 5.1.12

### Patch Changes

- @inlang/sdk@0.26.3

## 5.1.11

### Patch Changes

- @inlang/sdk@0.26.2

## 5.1.10

### Patch Changes

- @inlang/sdk@0.26.1

## 5.1.9

### Patch Changes

- Updated dependencies [676c0f905]
  - @inlang/sdk@0.26.0

## 5.1.8

### Patch Changes

- Updated dependencies [87bed968b]
- Updated dependencies [23ca73060]
  - @inlang/sdk@0.25.0

## 5.1.7

### Patch Changes

- @inlang/sdk@0.24.1

## 5.1.6

### Patch Changes

- Updated dependencies [c38faebce]
  - @inlang/sdk@0.24.0

## 5.1.5

### Patch Changes

- Updated dependencies [b920761e6]
  - @inlang/sdk@0.23.0

## 5.1.4

### Patch Changes

- Updated dependencies [cd29edb11]
  - @inlang/sdk@0.22.0

## 5.1.3

### Patch Changes

- Updated dependencies [e20364a46]
  - @inlang/sdk@0.21.0

## 5.1.2

### Patch Changes

- Updated dependencies [bc5803235]
  - @inlang/sdk@0.20.0

## 5.1.1

### Patch Changes

- Updated dependencies [8b05794d5]
  - @inlang/sdk@0.19.0

## 5.1.0

### Minor Changes

- cafff8748: adjust tests and fix erros message

### Patch Changes

- Updated dependencies [cafff8748]
  - @inlang/sdk@0.17.0

## 5.0.0

### Major Changes

- 55d4c3497: The matcher functionallity of plugins is now unbundled. Former paraglide-jsplugin is moved to plugins and named m-function-matcher and the matching functionallity pf the json plugin is now unbundled in the t-function-matcher plugin.

## 4.10.0

### Minor Changes

- a39638334: add support for new document selector typescriptreact

## 4.9.0

### Minor Changes

- 2150b4873: fix: path patterns can start as as an absolute path like `/resources/{languageTag}.json`

## 4.8.0

### Minor Changes

- 2f924df32: added Modulesettings validation via the Typebox JSON Schema Validation. This ensure that users can exclusively use module settings when there are given by the moduel

### Patch Changes

- Updated dependencies [2f924df32]
  - @inlang/sdk@0.16.0

## 4.7.0

### Minor Changes

- 0055f20b1: update README

## 4.6.1

### Patch Changes

- 4668f637a: Added test for empty object in nested translation file.
- Updated dependencies [2976a4b15]
  - @inlang/sdk@0.10.0

## 4.6.0

### Minor Changes

- f40ab4ca9: refactor: use plugin api v2

### Patch Changes

- Updated dependencies [0f9dc72b3]
  - @inlang/sdk@0.9.0

## 4.5.0

### Minor Changes

- b7dfc781e: change message format match from object to array

### Patch Changes

- Updated dependencies [b7dfc781e]
  - @inlang/sdk@0.8.0

## 4.4.0

### Minor Changes

- 7e112af9: isolated detect formating function for plugins

### Patch Changes

- Updated dependencies [7e112af9]
  - @inlang/detect-formatting@0.2.0

## 4.3.0

### Minor Changes

- 0d0502f4: deprecate detectedLanguageTags

### Patch Changes

- Updated dependencies [0d0502f4]
  - @inlang/plugin@1.3.0

## 4.2.0

### Minor Changes

- 25fe8502: refactor: remove plugin.meta and messageLintRule.meta nesting

### Patch Changes

- Updated dependencies [25fe8502]
  - @inlang/plugin@1.2.0

## 4.1.0

### Minor Changes

- 973858c6: chore(fix): remove unpublished dependency which lead to installation failing

### Patch Changes

- Updated dependencies [973858c6]
  - @inlang/plugin@1.1.0

## 3.0.12

### Patch Changes

- Remove login of "files" in console

## 3.0.11

### Patch Changes

- 77a6deed: Added test for unused folder in language dir (fixed ignore at getLanguages)

## 3.0.10

### Patch Changes

- 61ec4dac: chore: fix the id of the plugin from `inlang.plugin-i18next` to `inlang.plugin-json`

## 3.0.9

### Patch Changes

- 0c82623d: fix ignore folder at getLanguage function

## 3.0.8

### Patch Changes

- 12fe1943: support language folders and addLanguage button

## 3.0.7

### Patch Changes

- 80dc45d4: Added icon and changed links to point on json plugin in monorepo

## 3.0.6

### Patch Changes

- ceae4a83: fix: prevent split(regex) from generating empty text elements

## 3.0.5

### Patch Changes

- 6326e01e: fix: placeholder matching https://github.com/opral/inlang/issues/955

## 3.0.4

### Patch Changes

- 138df7cc: fix: don't match functions that ends with a t but are not a t function like somet("key").

## 3.0.3

### Patch Changes

- db4949e3: Internal refactoring by using the i18next plugin as base.

## 3.0.2

### Patch Changes

- 65c3af4b: Changed readme

## 3.0.1

### Patch Changes

- cbe0f68e: Fix github workflow

## 3.0.0

### Major Changes

- ad123f89: added json-plugin to monorepo

### Patch Changes

- 8310bb43: Fixed test
