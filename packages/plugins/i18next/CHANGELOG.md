# @inlang/plugin-i18next

## 6.4.0

### Minor Changes

- 9be7627: Export exact numbers created by `@inlang/plugin-icu1` and editors, and keep `_zero` files unchanged.

  - An exact `0` on an un-annotated alias of `count` (`.local countPluralExact = {$count}`, ICU `{count, plural, =0 {…}}`) exports as `key_zero`, like an exact `0` on `count` itself. i18next looks up `_zero` whenever `count === 0`, in every language. Where the plural category `zero` covers more than 0 (Latvian: 10, 11–19, 20, …), i18next uses `_zero` for those counts too. An exact 0 can then only be exported next to a `zero` form with the same text; otherwise export fails with an error, because the "=0" text would also show for 10, 11, 20, ….
  - Exact numbers i18next cannot express (`=1`, `=5`, exact numbers of ordinal plurals) fail the export with an error naming the bundle and number instead of a generic "cannot represent selector" error.
  - Two forms that map to the same key with different texts fail the export with an error naming the key, bundle and locale, instead of keeping one, except `_zero` where the `zero` category selects no number other than 0 (see below). Files change only where the old output was wrong. `_zero` imports as before, as an exact `count = 0` form plus a `countPlural = zero` form, and keeps its position in the file. Where the `zero` category selects no number other than 0 (English, French, Arabic, Welsh, and tags Intl has no plural rules for), i18next shows the exact text for `_zero`. The export writes it, as earlier versions did, also if only the "=0" form was edited. In Latvian, where `zero` also selects 10, 11–19, 20, …, earlier versions wrote the "=0" text for all of those counts. Example: an "=0" form "Nav preču" and a `zero` form "{{count}} preču" made `item_zero` "Nav preču" also for 10 items. That now fails until both forms have the same text.
  - Locales written with underscores (`pt_BR`) resolve their plural rules.

### Patch Changes

- d9cb529: Saving a project no longer rewrites whole translation files. Only the entries of edited, added or removed messages change; every other entry keeps its text (escapes, `{{ name }}` spacing), key order and formatting (indentation, line endings, final newline), so diffs in git show just the edits. New keys are inserted after the key that precedes them in the export. Files without a previous version (e.g. a new locale), and previous files that are not valid JSON, are written whole as before. Exports of large projects are also faster.

  Keys with `:` are exported as they are imported: in a project with one file per locale (`pathPattern` is a string), `"err:notFound"` stays a key of the locale file instead of becoming a namespace `err`, which made saving overwrite the whole file with that one key. With namespaces, `common:err:notFound` is written as the key `err:notFound` of `common` instead of `err`.

- dc4b3eb: Namespaces with `:` in their name (e.g. `"app:errors"` in `pathPattern`) are saved to their own file. Before, the bundle id `app:errors:notFound` was split at its first `:` and written as the key `errors:notFound` of a namespace `app`: to the file of another namespace, or to a file outside the project's `pathPattern`, while the namespace's own file kept the old texts, so edits were lost on the next load. The namespace of a bundle id is now the namespace of `pathPattern` that the id starts with. If two namespaces match, like `a` and `a:b` for `a:b:c` (the key `b:c` of `a` and the key `c` of `a:b` have the same bundle id), the message stays in the namespace whose files have it (also when its plural or context forms change, and a new translation goes there too), and a new message goes to the longer namespace, `a:b`. If both files have the key, the file read last wins as when loading the project; edits are written to it, and the other file keeps its text. Deleting such a message removes it from both files, which are then written in full.

  Every `{locale}` of a `pathPattern` is replaced when files are read, as when they are saved, so a pattern like `./{locale}/common.{locale}.json` reads the file it writes.

- 5423aa7: Export ICU `#` (imported by `@inlang/plugin-icu1` as `icu:pound`) that no longer sits in a plural, for example after an editor removed the plural.

  - `#` without a plural offset exports as `{{count, number}}`, which i18next formats like ICU formats `#`. It used to export as `{{count, icu:pound}}`, an unknown i18next format.
  - `#` with a plural offset displays `count - offset`, which i18next cannot express. The export fails with an error naming the bundle, locale and offset instead of "Not implemented".
  - Other functions with options fail the export with an error naming the options, function, variable, bundle and locale instead of "Not implemented".

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

## 6.3.0

### Minor Changes

- 067d8bc: Preserve underscored i18next keys and classify contexts consistently across locales.
  Add `contextValues` to resolve ambiguous context suffixes, including single-context
  resources and values containing underscores. Mixed cardinal/ordinal MF2 bundles
  use a `pluralType` input to preserve lookup behavior; ordinal zero no longer
  overwrites cardinal zero on export.

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- Updated dependencies [68eefaf]
- Updated dependencies [56891d6]
- Updated dependencies [5df91b6]
  - @inlang/sdk@3.1.0

## 6.2.10

### Patch Changes

- Updated dependencies [924dd7e]
  - @inlang/sdk@3.0.6

## 6.2.9

### Patch Changes

- Updated dependencies [c73ed13]
- Updated dependencies [59715d2]
  - @inlang/sdk@3.0.5

## 6.2.8

### Patch Changes

- Updated dependencies [c81ef61]
  - @inlang/sdk@3.0.4

## 6.2.7

### Patch Changes

- Updated dependencies [3c1fbc6]
  - @inlang/sdk@3.0.3

## 6.2.6

### Patch Changes

- Updated dependencies [b012f5e]
  - @inlang/sdk@3.0.2

## 6.2.5

### Patch Changes

- Updated dependencies [78ad386]
  - @inlang/sdk@3.0.1

## 6.2.4

### Patch Changes

- dfe5d1e: Reject selectors that i18next cannot represent instead of silently dropping variants during export.
- eb18b70: Emit the TypeScript declarations advertised by the package during production builds.
- Updated dependencies [fb46551]
- Updated dependencies [aaf4e05]
- Updated dependencies [5d7b021]
- Updated dependencies [7ea66f8]
  - @inlang/sdk@3.0.0

## 6.2.3

### Patch Changes

- Updated dependencies [eccea01]
  - @inlang/sdk@2.10.2

## 6.2.2

### Patch Changes

- Updated dependencies [bf2af52]
  - @inlang/sdk@2.10.1

## 6.2.1

### Patch Changes

- e94b2a9: Restore Sherlock (inlang.vs-code-extension) inline annotations, hovers, and extraction for i18next projects. The plugin shipped a static `meta["app.inlang.ideExtension"]` whose matchers require per-call settings; Sherlock skips its settings-injecting `addCustomApi` migration when `meta` is already set and invokes matchers without settings, so every match silently returned empty. Removing the static `meta` lets Sherlock's migration bake the plugin settings into the matchers, including namespace inference from `useTranslation('ns')`. Fixes https://github.com/opral/inlang/issues/4368

## 6.2.0

### Minor Changes

- 6680ac1: fix `saveProjectToDirectory` throwing `pathPattern.replace is not a function` when a plugin's `pathPattern` is a namespace object (https://github.com/opral/inlang/issues/4356)

  - `ExportFile` has a new optional `metadata` field — the counterpart of `ImportFile.toBeImportedFilesMetadata`. Plugins can use it to pass information to the writer, e.g. the namespace an exported file belongs to.
  - `saveProjectToDirectory` resolves namespaced `pathPattern` objects (`Record<namespace, pattern>`) via `ExportFile.metadata.namespace` and writes each exported file to the path its namespace pattern describes. Files without a resolvable namespace fall back to being written by `file.name` instead of throwing.
  - `@inlang/plugin-i18next` now provides `metadata: { namespace }` for namespaced export files. Saving a multi-namespace i18next project requires this plugin version (older plugin versions no longer crash but fall back to writing `{namespace}-{locale}.json` files relative to the project directory).

### Patch Changes

- 2db3126: Fix `exportFiles` throwing `The variant does not have a context match` (or `The variant does not have a plural match`) for bundles that `importFiles` itself created from i18next context and plural sibling keys. Variants without a literal context/plural match — catchall variants and the base key fallback — now serialize back to their base key, so projects using context keys round-trip again. Fixes https://github.com/opral/inlang/issues/4355
- 138b4e6: Import i18next context and plural sibling keys with explicit catchall matches on the base key variants, consistent selectors across the bundle, and most-specific-first variant ordering (`key_context_plural` > `key_context` > `key_plural` > `key`). First-match-wins consumers like the Paraglide compiler now resolve context the way i18next does instead of always returning the base variant. Fixes https://github.com/opral/inlang/issues/4354
- 75a0a85: Parse i18next ordinal plural keys (`key_ordinal_one`, including context combinations like `key_male_ordinal_one`) as a dedicated `countOrdinal` selector backed by `Intl.PluralRules` with `{ type: "ordinal" }`, instead of misparsing them as context `"ordinal"` with cardinal categories. Compiled messages now produce "1st/2nd/3rd/4th" correctly from a plain `count` input, and context+ordinal keys — which previously lost their context and ordinal marker on export — round-trip unchanged. Fixes https://github.com/opral/inlang/issues/4358
- a8a801b: Import `_zero` keys with i18next's actual semantics: an exact `count = 0` match (via a `count` selector ahead of the plural category) plus the Intl "zero" category fallback. Previously `_zero` was modeled only as the Intl plural category, which most languages never select — so the zero translation was dead code at `count = 0` in e.g. English and French. Fixes https://github.com/opral/inlang/issues/4357
- Updated dependencies [6680ac1]
  - @inlang/sdk@2.10.0

## 6.1.5

### Patch Changes

- Updated dependencies [a853d5f]
  - @inlang/sdk@2.9.3

## 6.1.4

### Patch Changes

- Updated dependencies [b292999]
  - @inlang/sdk@2.9.2

## 6.1.3

### Patch Changes

- Updated dependencies [bcd4335]
  - @inlang/sdk@2.9.1

## 6.1.2

### Patch Changes

- Updated dependencies [f1dfc25]
  - @inlang/sdk@2.9.0

## 6.1.1

### Patch Changes

- Updated dependencies [6e6ee7f]
  - @inlang/sdk@2.8.0

## 6.1.0

### Minor Changes

- 6defee0: Add markup-aware import and export support to the i18next plugin.

  - Added support for rich text tag syntax (`<tag>`, `</tag>`, `<tag/>`) in import/export, mapped to SDK markup pattern elements.
  - Added roundtrip coverage for markup-only and mixed markup + interpolation patterns.
  - Added a clear error when `variableReferencePattern` is `["<", ">"]` and markup is present, because those syntaxes conflict.

### Patch Changes

- Updated dependencies [6defee0]
  - @inlang/sdk@2.7.0

## 6.0.15

### Patch Changes

- Updated dependencies [9553df6]
  - @inlang/sdk@2.6.2

## 6.0.14

### Patch Changes

- Updated dependencies [c6708ee]
  - @inlang/sdk@2.6.1

## 6.0.13

### Patch Changes

- Updated dependencies [c1d8e5a]
  - @inlang/sdk@2.6.0

## 6.0.12

### Patch Changes

- Updated dependencies [e9d7a74]
- Updated dependencies [65c33c2]
- Updated dependencies [9d73b90]
- Updated dependencies [2e8318b]
- Updated dependencies [323295a]
  - @inlang/sdk@2.5.0

## 6.0.11

### Patch Changes

- Updated dependencies [22089a2]
  - @inlang/sdk@2.4.9

## 6.0.10

### Patch Changes

- 0aa07ec: Re-enables `variableReferencePattern` settings for the v6 `importFiles` and `exportFiles` APIs.

  https://github.com/opral/inlang-paraglide-js/issues/513

## 6.0.9

### Patch Changes

- Updated dependencies [56acb22]
  - @inlang/sdk@2.4.8

## 6.0.8

### Patch Changes

- Updated dependencies [bd2c366]
  - @inlang/sdk@2.4.7

## 6.0.7

### Patch Changes

- Updated dependencies [49a7880]
  - @inlang/sdk@2.4.6

## 6.0.6

### Patch Changes

- Updated dependencies [083ff1f]
  - @inlang/sdk@2.4.5

## 6.0.5

### Patch Changes

- @inlang/sdk@2.4.4

## 6.0.4

### Patch Changes

- @inlang/sdk@2.4.3

## 6.0.3

### Patch Changes

- @inlang/sdk@2.4.2

## 6.0.2

### Patch Changes

- 73cc245: fix: key name of sherlock extension

## 6.0.1

### Patch Changes

- Updated dependencies [5a991cd]
  - @inlang/sdk@2.4.1

## 6.0.0

### Major Changes

- 75de822: # Update plugins to support Sherlock v2 & SDK v2 compatibility

  The plugin now uses the new API for message extraction (`bundleId` instead of `messageId`).

  ## Upgrading to Sherlock v2

  **There is no action needed** to upgrade to Sherlock v2. The plugin is now compatible with the new version and if you linked the plugin with `@latest`as we advise in the documentation.

  You should be able to use the plugin with Sherlock v2 without any issues. If there are any issues, please let us know via Discord/GitHub.

  ### Want to keep Sherlock v1 and the old plugin version?

  If you still want to use Sherlock v1, please use the previous major version of the plugin. For Sherlock itself, [please pin the version to `1.x.x`](https://github.com/microsoft/vscode-docs/blob/vnext/release-notes/v1_91.md#extension-install-options) in the VS Code extension settings.

  ### Breaking changes

  - Lint rules are now polyfilled (and therefore may work different), as we are currently reworking how lint rules are working with [Lix Validation Rules](https://lix.dev).
  - The `messageId` parameter in the `extractMessages` function has been renamed to `bundleId`. This change is due to the new API in Sherlock v2. If you are using the `extractMessages` function, please update the parameter name to `bundleId`.

## 5.0.10

### Patch Changes

- Updated dependencies [c0b857a]
- Updated dependencies [91ba4eb]
  - @inlang/sdk@2.3.0

## 5.0.9

### Patch Changes

- Updated dependencies [c53b1a9]
  - @inlang/sdk@2.2.2

## 5.0.8

### Patch Changes

- Updated dependencies [f51736f]
- Updated dependencies [adf7d6c]
  - @inlang/sdk@2.2.1

## 5.0.7

### Patch Changes

- Updated dependencies [fc41e71]
  - @inlang/sdk@2.2.0

## 5.0.6

### Patch Changes

- @inlang/sdk@2.1.3

## 5.0.5

### Patch Changes

- Updated dependencies [61b9782]
  - @inlang/sdk@2.1.2

## 5.0.4

### Patch Changes

- @inlang/sdk@2.1.1

## 5.0.3

### Patch Changes

- Updated dependencies [8af8ba9]
- Updated dependencies [57f9e7f]
- Updated dependencies [4444034]
- Updated dependencies [fa94c1f]
  - @inlang/sdk@2.1.0

## 5.0.2

### Patch Changes

- add properties for backwards compatibility

## 5.0.1

### Patch Changes

- @inlang/sdk@2.0.0

## 5.0.0

### Major Changes

- 3d5a454: Upgrade to the @inlang/sdk v2.0.0.

  No breaking change is expected. But, if you encounter issues, fix the version of the plugin to the previous major version. This version of the i18next plugin adds support for

  - pluralization
  - selectors
  - and more

## 4.14.13

### Patch Changes

- @inlang/sdk@0.36.3

## 4.14.12

### Patch Changes

- Updated dependencies [2fc5feb]
  - @inlang/sdk@0.36.2

## 4.14.11

### Patch Changes

- Updated dependencies [1077e06]
  - @inlang/sdk@0.36.1

## 4.14.10

### Patch Changes

- Updated dependencies [8ec7b34]
- Updated dependencies [05f9282]
  - @inlang/sdk@0.36.0

## 4.14.9

### Patch Changes

- Updated dependencies [8e9fc0f]
  - @inlang/sdk@0.35.9

## 4.14.8

### Patch Changes

- 04e804b: add human readble id tests to plugins

## 4.14.7

### Patch Changes

- Updated dependencies [da7c207]
  - @inlang/sdk@0.35.8

## 4.14.6

### Patch Changes

- Updated dependencies [2a5645c]
  - @inlang/sdk@0.35.7

## 4.14.5

### Patch Changes

- Updated dependencies [9d2aa1a]
  - @inlang/sdk@0.35.6

## 4.14.4

### Patch Changes

- Updated dependencies [64e30ee]
  - @inlang/sdk@0.35.5

## 4.14.3

### Patch Changes

- @inlang/sdk@0.35.4

## 4.14.2

### Patch Changes

- @inlang/sdk@0.35.3

## 4.14.1

### Patch Changes

- @inlang/sdk@0.35.2

## 4.14.0

### Minor Changes

- c64f346: increase batching to 50 for i18n plugin

### Patch Changes

- @inlang/sdk@0.35.1

## 4.13.41

### Patch Changes

- Updated dependencies [ae47203]
  - @inlang/sdk@0.35.0

## 4.13.40

### Patch Changes

- Updated dependencies [d27a983]
- Updated dependencies [a27b7a4]
  - @inlang/sdk@0.34.10

## 4.13.39

### Patch Changes

- Updated dependencies [a958d91]
  - @inlang/sdk@0.34.9

## 4.13.38

### Patch Changes

- Updated dependencies [10dbd02]
  - @inlang/sdk@0.34.8

## 4.13.37

### Patch Changes

- Updated dependencies [5209b81]
  - @inlang/sdk@0.34.7

## 4.13.36

### Patch Changes

- Updated dependencies [f38536e]
  - @inlang/sdk@0.34.6

## 4.13.35

### Patch Changes

- Updated dependencies [b9eccb7]
  - @inlang/sdk@0.34.5

## 4.13.34

### Patch Changes

- Updated dependencies [2a90116]
  - @inlang/sdk@0.34.4

## 4.13.33

### Patch Changes

- c3c5c59: update documentation

## 4.13.32

### Patch Changes

- Updated dependencies [bc17d0c]
  - @inlang/sdk@0.34.3

## 4.13.31

### Patch Changes

- 1abcc3f: update docs

## 4.13.30

### Patch Changes

- Updated dependencies [3c959bc]
  - @inlang/sdk@0.34.2

## 4.13.29

### Patch Changes

- @inlang/sdk@0.34.1

## 4.13.28

### Patch Changes

- Updated dependencies [5b8c053]
  - @inlang/sdk@0.34.0

## 4.13.27

### Patch Changes

- @inlang/sdk@0.33.1

## 4.13.26

### Patch Changes

- Updated dependencies [d573ab8]
  - @inlang/sdk@0.33.0

## 4.13.25

### Patch Changes

- bc00427: fix typo
- Updated dependencies [bc9875d]
  - @inlang/sdk@0.32.0

## 4.13.24

### Patch Changes

- Updated dependencies [c068dd2]
  - @inlang/sdk@0.31.0

## 4.13.23

### Patch Changes

- Updated dependencies [9b26a31]
  - @inlang/sdk@0.30.0

## 4.13.22

### Patch Changes

- Updated dependencies [62dfa26]
  - @inlang/sdk@0.29.0

## 4.13.21

### Patch Changes

- @inlang/sdk@0.28.3

## 4.13.20

### Patch Changes

- 923a4bb: fix discord link

## 4.13.19

### Patch Changes

- @inlang/sdk@0.28.2

## 4.13.18

### Patch Changes

- @inlang/sdk@0.28.1

## 4.13.17

### Patch Changes

- Updated dependencies [1e43ae4]
  - @inlang/sdk@0.28.0

## 4.13.16

### Patch Changes

- f3b0489: fix typo

## 4.13.15

### Patch Changes

- 4837297: File locking for concurrent message updates through the load/store plugin api
  Auto-generated human-IDs and aliases - only with experimental: { aliases: true }
- Updated dependencies [4837297]
  - @inlang/sdk@0.27.0

## 4.13.14

### Patch Changes

- @inlang/sdk@0.26.5

## 4.13.13

### Patch Changes

- 960f8fb70: rename the vscode extension to "Sherlock"
  - @inlang/sdk@0.26.4

## 4.13.12

### Patch Changes

- d9cf66170: update docs for apps and plugins
- b7344152a: updated the docs

## 4.13.11

### Patch Changes

- @inlang/sdk@0.26.3

## 4.13.10

### Patch Changes

- @inlang/sdk@0.26.2

## 4.13.9

### Patch Changes

- @inlang/sdk@0.26.1

## 4.13.8

### Patch Changes

- Updated dependencies [676c0f905]
  - @inlang/sdk@0.26.0

## 4.13.7

### Patch Changes

- Updated dependencies [87bed968b]
- Updated dependencies [23ca73060]
  - @inlang/sdk@0.25.0

## 4.13.6

### Patch Changes

- @inlang/sdk@0.24.1

## 4.13.5

### Patch Changes

- Updated dependencies [c38faebce]
  - @inlang/sdk@0.24.0

## 4.13.4

### Patch Changes

- Updated dependencies [b920761e6]
  - @inlang/sdk@0.23.0

## 4.13.3

### Patch Changes

- Updated dependencies [cd29edb11]
  - @inlang/sdk@0.22.0

## 4.13.2

### Patch Changes

- Updated dependencies [e20364a46]
  - @inlang/sdk@0.21.0

## 4.13.1

### Patch Changes

- Updated dependencies [bc5803235]
  - @inlang/sdk@0.20.0

## 4.13.0

### Minor Changes

- b66068127: Matcher Improvments. 'useTranslation' hook can contain a namespace and keyPrefix for the whole page. The improved matcher can recognize it and adds it to the messageId if needed.

## 4.12.1

### Patch Changes

- Updated dependencies [8b05794d5]
  - @inlang/sdk@0.19.0

## 4.12.0

### Minor Changes

- cafff8748: adjust tests and fix erros message
- 39beea7dd: change return type of extractMessageOptions

### Patch Changes

- Updated dependencies [cafff8748]
  - @inlang/sdk@0.17.0

## 4.11.0

### Minor Changes

- a39638334: add support for new document selector typescriptreact

## 4.10.0

### Minor Changes

- 2150b4873: fix: path patterns can start as as an absolute path like `/resources/{languageTag}.json`

## 4.9.0

### Minor Changes

- 2f924df32: added Modulesettings validation via the Typebox JSON Schema Validation. This ensure that users can exclusively use module settings when there are given by the moduel

### Patch Changes

- Updated dependencies [2f924df32]
  - @inlang/sdk@0.16.0

## 4.8.0

### Minor Changes

- 0055f20b1: update README

## 4.7.0

### Minor Changes

- 7bcb365ed: update `config init` deprecation

### Patch Changes

- 4668f637a: Added test for empty object in nested translation file.
- Updated dependencies [2976a4b15]
  - @inlang/sdk@0.10.0

## 4.6.0

### Minor Changes

- 6e4ea967d: refactor: now uses the plugin api v2.0

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

## 3.0.2

### Patch Changes

- 1672ec38: Throw error when using wildcard in version 3

## 3.0.1

### Patch Changes

- 6c7e2077: Single namespace path defined without object syntax

## 3.0.0

### Major Changes

- 66fd1a55: The pathPattern has a different type now. Old: `pathPattern: string` new: `pathPattern: string | {[key: string]: string}`

## 2.2.4

### Patch Changes

- 12fe1943: support language folders and addLanguage button

## 2.2.3

### Patch Changes

- ceae4a83: fix: prevent split(regex) from generating empty text elements

## 2.2.2

### Patch Changes

- 6326e01e: fix: placeholder matching https://github.com/opral/inlang/issues/955

## 2.2.1

### Patch Changes

- 138df7cc: fix: don't match functions that ends with a t but are not a t function like somet("key").

## 2.2.0

### Minor Changes

- 0093c4b8: Substantial internal refactorings to increase the quality of the plugin.

## 2.1.0

### Minor Changes

- bfa65665: The message reference matchers have been completely overhauled.
