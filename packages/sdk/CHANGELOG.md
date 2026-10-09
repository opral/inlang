# @inlang/sdk

## 4.0.0

### Major Changes

- 2390c5a: **Breaking: `project.db` uses the table and column names Lix stores.** The SDK no longer rewrites table and column names before queries reach Lix, and no longer strips the `lixcol_*` columns from results. The Kysely schema declares the tables and columns exactly as Lix exposes them, so the SQL you write is the SQL that runs.

  | Before (3.x)            | After (4.0)                    |
  | ----------------------- | ------------------------------ |
  | `selectFrom("bundle")`  | `selectFrom("inlang_bundle")`  |
  | `selectFrom("message")` | `selectFrom("inlang_message")` |
  | `selectFrom("variant")` | `selectFrom("inlang_variant")` |
  | `bundleId`              | `bundle_id`                    |
  | `messageId`             | `message_id`                   |
  | `"bundle.id"`           | `"inlang_bundle.id"`           |
  | `"message.bundleId"`    | `"inlang_message.bundle_id"`   |
  | `"variant.messageId"`   | `"inlang_variant.message_id"`  |

  Also changed:

  - `selectBundleNested()` returns messages with `bundle_id` and variants with `message_id`, and filters with `.where("inlang_bundle.id", "=", id)` (`"bundle.id"` throws).
  - `createMessage()` and `createVariant()` return `bundle_id` and `message_id`.
  - `insertBundleNested()`, `upsertBundleNested()` and `updateBundleNested()` take snake_case rows, as do `insertInto()` and `updateTable()`.
  - `selectAll()` includes the `lixcol_*` columns. Leave them out when you write a row back with `insertInto()` or `updateTable()`.
  - `BundleRow`, `MessageRow` and `VariantRow` (plus `NewBundleRow`, `BundleRowUpdate`, …) type the database rows. `BundleNested` and `MessageNested` use them. `Bundle`, `Message` and `Variant` are the camelCase plugin shapes.

  `updateBundleNested()` now only writes the inlang columns (`declarations`; `bundle_id`, `locale`, `selectors`; `message_id`, `matches`, `pattern`) of the bundle, messages and variants it receives. It used to pass the nested `messages` array to the bundle update, which failed.

  Plugins are not affected: `importFiles()` and `exportFiles()` still exchange `Bundle`, `Message` and `Variant` with camelCase `bundleId` and `messageId`, and the SDK maps them to and from the database columns. Existing plugins work with this SDK.

  See "Migrating to 4.0" in the SDK README.

### Minor Changes

- f45a761: Add the `empty-variant` check: a variant (form) whose pattern is empty while another variant of the message has text, e.g. an ICU `=0 {}`, is reported with its `variantId` and `matches`, the reference locale's included. `checkTranslation()` reports it as `{ type: "empty-variant" }`.
- 356a50a: `exportFiles` receives the files it overwrites, so that plugins can keep the text of unchanged entries.

  - The plugin API's `exportFiles` has a new optional argument `files`: the current content of the files that `toBeImportedFiles` lists, as `{ path, locale, content, metadata? }` (type `ExistingFile`). Only files that exist are passed. Plugins that ignore it work as before, and plugins that use it still work on hosts that don't pass it.
  - `saveProjectToDirectory` reads the files of `toBeImportedFiles` from disk and passes them to `exportFiles`.
  - `project.exportFiles({ pluginKey, files })` passes `files` through, for apps that write the exported files themselves.
  - `ExportFile` has a new optional `verbatim` flag. A plugin sets it on a file that keeps the formatting of the existing file, and `saveProjectToDirectory` writes it byte for byte instead of re-indenting the JSON like the existing file. Output without the flag is re-indented as before.
  - `saveProjectToDirectory` no longer rewrites a file whose content didn't change, and keeps the byte order mark of a JSON file it re-indents (before, such files were minified).

- ad469a7: New helpers for plugins in `@inlang/sdk/json-formatting` to keep the text of unchanged entries of JSON translation files.

  `keepUnchangedJsonEntries({ exported, files, settings, importFiles, exportFiles })` takes the files of a full export and, for every file that replaces one of `exportFiles`' `files`, keeps the previous text of every entry that didn't change, the key order and the formatting (indentation, line endings, final newline, byte order mark). An entry is unchanged if the plugin writes the same JSON value for it as for what the previous entry imports to (the previous files are imported together, like a project is loaded), so legacy shapes, other escaping and flat keys that the plugin writes nested are kept too. New keys are inserted after the key that precedes them in the full export, removed keys are dropped, and keys the plugin neither imports nor writes are kept. The results are only used if the plugin imports them as the full export; otherwise the full export of a file is written. Files that keep previous text are marked `verbatim`.

  `stringifyJsonKeepingEntries({ previous, previousCanonical, next })` is the underlying writer for a single file.

- fa0777c: `pluralRules()` understands a literal ICU `offset` option: the plural's categories stay known (instead of only the catch-all being required) and the offset is reported as `offset`, so editors can show example numbers shifted by it.
- 94cf565: Add browser-compatible `checkProject`, `applyFix` and `findUsages` APIs for missing and empty translations, translation checks against a reference locale (missing or unknown variables, missing markup, missing plural/select variants), unused messages and usage locations. Checks expose serializable fixes, explicit analysis status, optional bundle scopes and intentional fallback exclusions. Deletion fixes rerun usage analysis and verify the bundle's revision inside an atomic transaction before removing all locales and variants.

  Plugins can implement `analyzeUsage`; the m-function matcher analyzes ESM JavaScript, JSX, TypeScript, TSX and Svelte source with conservative handling of dynamic references, namespace escapes, parse failures and unsupported formats. Unresolved analysis withholds unused diagnostics and deletion fixes. Analyzers can return source `references`, which `findUsages` exposes for code previews and "find references". `checkTranslation()` runs the translation checks on unsaved input, and `checkBundle()` checks one in-memory bundle synchronously for editors that keep bundles in memory. The selector rules behind `missing-variant` are exported for editors (`selectorGroups`, `requiredVariants`, `missingVariants`, `pluralRules`, …): a translation needs the reference's select values and exact numbers, and an ICU exact number (`=0`) and the plural of the same input are one choice.

- 4ecf2bd: Deleting every message of a translation file now persists. If all messages of a locale (or of an i18next namespace of a locale) were deleted, the export had nothing to write for that file, so `saveProjectToDirectory` left it on disk as it was, and the deleted messages came back on the next load.

  The plugin contract of `exportFiles` with `files` is extended: a plugin also returns a file for every previous file that the project read, that holds messages the project no longer has and that the export doesn't otherwise write, without those messages. Whether the project read a file is the new `ExistingFile.imported`: `saveProjectToDirectory` sets it for files whose content is what `loadProjectFromDirectory` imported or what a save wrote. A file the project never read (e.g. of a locale added to the settings after loading, or changed on disk since) is never emptied; hosts that can't tell leave `imported` out. `keepUnchangedJsonEntries` does this for the JSON plugins (message-format, i18next, json, next-intl, icu1, apple-xcstrings): every key that imports to a message is removed (walking into objects that hold messages), everything else (`$schema`, keys the plugin doesn't read) and the formatting stay, so a file whose messages were all deleted becomes `{}`, or `{ "$schema": … }`. The file is kept, not deleted: the plugin still lists it for the locale, the next message of the locale goes there, and tools may expect it. The previous file's `path` is the exported file's `name` and its `metadata.pathPattern`, so `saveProjectToDirectory` writes it to exactly that file, also one of a `pathPattern` array; other hosts that pass `files` should write a file with a `metadata.pathPattern` there too. Files that hold no deleted message (e.g. an empty file, or an i18next namespace whose messages another namespace overrides) stay byte-identical.

  `@inlang/plugin-apple-strings` writes the `.strings` file of such a locale without its entries and their comments; other comments (e.g. a license header) stay. `@inlang/plugin-android` writes the `strings.xml` of such a locale without its messages; elements it doesn't import (non-translatable strings, `<string-array>`s, …) and heading comments stay. This includes the base locale's `values/strings.xml`: deleting every message of the base locale removes Android's default strings, so the app needs other default resources. If such a file can't be written without removing elements the plugin doesn't import, it is left as it is instead of failing the export.

  A file counts as read only as the locale (and namespace) it was read or written as, so a file that a settings change assigns to another locale (e.g. a new base locale for `values/`) is not emptied.

- fb83c18: Translation checks are more precise: variables and markup are compared with the reference forms that have the same exact numbers and select values (plural categories mean different numbers per locale, so a plural's input is needed in every form that isn't one number), a form for one exact number may leave out only that number's input variable, and an empty reference expects no variables. A translation that can't choose like the reference (no selector for a select's values, no plural the locale needs, or no exact-number selector for the reference's `=0`) gets the new `missing-selector` diagnostic with the `values` it can't express. Plural categories only millions select (French, Spanish, Italian, Portuguese, Catalan `many`) are no longer required; `pluralRules().requiredCategories` lists the required ones. Locales such as `pt_BR` are read as `pt-BR`. Full scans read patterns with one query per table, lowering peak memory.
- 3e9bd54: Usage analysis issues can locate the construct that makes the analysis incomplete. `UsageIssue` has optional `start` and `end` positions (1-based lines, 0-based columns, as for references), which `checkProject` and `findUsages` pass through. The m-function matcher reports one issue per unresolved construct, in source order, e.g. `src/Field.tsx` line 14 for `` m[`${fieldName}_label`]() ``, instead of one issue per reason and file.

### Patch Changes

- 5c0a84b: The `README.md` written into `*.inlang` folders now targets coding agents working in an app repo. It covers what to edit, the inlang CLI commands for common tasks (`check`, `machine translate`), Fink, Parrot and Sherlock, and how inlang relates to the i18n library (Paraglide JS). It keeps a short pointer for SDK tool builders.
- 691caec: `missing-variant` no longer reports impossible forms for i18next keys with both cardinal and ordinal forms (`.local $countPlural = {$count :plural type=$pluralType}`), the reference locale included. `requiredVariants` / `missingVariants` now compute the forms per plural type instead of as a product with the `pluralType` select: cardinals in its catch-all, ordinal categories under `pluralType=ordinal`, and `_zero`'s exact `pluralType=cardinal` 0, never `pluralType=ordinal` with 0 or `pluralType=cardinal` with the catch-all. Exact numbers and plural types are also needed only in the select branches (i18next context, gender) that use them: `c_male_one`, `c_male_other`, `c_zero`, `c_one`, `c_other` no longer needs a `context=male` 0 form. A branch the reference has no variant for still needs the reference's exact numbers (an ICU `=0` in each gender a translation adds). `selectorGroups()` reports the type select as `typeSelector` with `requiredKeysFor(typeValue)`, and lists the ordinal categories in `keys`, so `<inlang-message-forms>` offers "+ Add form" for them.
- b38facf: Re-importing files into an existing project no longer duplicates every variant with matches (plural, select, multi-selector, ICU exact + plural). `importFiles` and `upsertBundleNestedMatchByProperties` (used for legacy `loadMessages` plugins) matched existing variants with `JSON.stringify(matches)`, but the database returns matches with sorted keys (`{"key", "type", "value"}`) while plugins create them as `{type, key, value}`, so no variant with matches was ever found and each re-import inserted all of them again. Matches are now compared independently of the order of their properties and of the order of the matches of a multi-selector variant (every match names its selector with `key`). A fresh import, and a legacy message with two variants of the same matches, also treat such variants as one (the last one wins, like for identical matches).

  Projects that earlier re-imports filled with duplicates are repaired by the next import: of the variants of a message with the same matches, the oldest one is updated and the others are deleted.

  Re-imported variants now also take the order of the import. Variants are ordered by their id, so before, a variant that was updated in place kept its old position, e.g. when a file lists the variants in a different order than the database (a person reordered them, or a file that the published message-format plugin wrote with `sort` put the catch-all first). Runtimes such as Paraglide JS select the first matching variant, so the order is part of the message. If the order differs, the variants from the first one out of order on are inserted again in the order of the import, with new uuid v7 ids (and before them, any with ids that a new uuid v7 wouldn't sort after, such as uuid v4 or custom ids). So the id of a variant that moved changes; a variant that didn't move keeps its id, and re-importing unchanged files changes no rows. Messages whose variants have ids from the plugin are not reordered.

- abfd521: `keepUnchangedJsonEntries` now checks the kept files in the order a project load reads them. Its safety net re-imports the files as they will be on disk and only keeps their text if they read like the full export, but it read the exported files in the order the plugin returned them and the files the export doesn't replace after them. When two files have the same message (e.g. overlapping i18next namespaces), the file read last wins, so a different order could accept kept text with a stale copy of an edited message, and the edit was lost on the next load. The files are now read in the order of `files` (`toBeImportedFiles`, like `loadProjectFromDirectory`), an exported file at the place of the file it replaces (at every place for several files of a `pathPattern` array, which the host writes it to); a new file (no place known yet) before the next exported file of its locale that has a place, so plugins that export in load order like i18next keep their order, else last. The JSON plugins bundle the helper.
- 56923c5: Translation checks skip variants for a plural category the locale never selects. i18next's `_zero` is imported as an exact `count=0` form and a `countPlural=zero` form; German, English or French never select `zero`, so its form no longer gets `missing-variable {count}` (or `unknown-variable`, `missing-markup`, `empty-variant`) diagnostics, and the reference locale checked against itself stays clean. Categories the locale does select keep every check (Latvian `zero` still needs `{count}`). New export: `isUnreachableVariant(variant, declarations, locale)`.
- b0d8a4f: New messages, variants and bundles get uuid v7 ids instead of random uuid v4 ids, so they keep the order they were created in. Messages and variants are ordered by id (`selectBundleNested`, exports), and the database already creates uuid v7 ids, but `insertBundleNested` / `upsertBundleNested` (used by editors), the deprecated `createMessage` / `createVariant` helpers and `inlang machine translate` created v4 ids: variants a person added in an editor, or the variants of a machine-translated message, came out in random order. Runtimes like Paraglide JS select the first matching variant, so the order is part of the message. Existing ids don't change.

## 3.1.0

### Minor Changes

- 56891d6: Expose `detectJsonFormatting` through `@inlang/sdk/json-formatting` to serialize JSON with its existing indentation and trailing newline.

### Patch Changes

- 68eefaf: Allow `paraglide.config.js`, `.mjs`, `.ts`, and `.cjs` in the generated project `.gitignore` so Paraglide compiler options can be committed and shared across clones and CI. Existing projects receive the updated ignore rules when the SDK upgrade regenerates project metadata. Fixes https://github.com/opral/paraglide-js/issues/775.
- 5df91b6: Upgrade the Lix SDK dependency to 0.19.0 for improved query performance and lower memory use.

## 3.0.6

### Patch Changes

- 924dd7e: Upgrade Lix to v0.17.0.

## 3.0.5

### Patch Changes

- c73ed13: Upgrade Lix to 0.16.1 to fix importing alphabetically sorted messages when a transaction exceeds 512 tracked-state rows.
- 59715d2: Preserve the original error when a Lix transaction commit fails. Serialize Kysely connection leases so unrelated queries cannot join another caller's transaction and concurrent transactions execute independently. Beginning, committing, or rolling back a controlled transaction now releases its connection if it fails. Consumed transactions reject further queries instead of executing outside the transaction.

  Restoring an in-memory project snapshot replaces file content at snapshot-owned paths, including files initialized by Lix, while preserving unrelated destination files.

## 3.0.4

### Patch Changes

- c81ef61: Upgrade to Lix SDK 0.15.1 and migrate query results to plain JavaScript rows. Use the engine fix for transaction-local message and variant lookups, including CTE reads, without rewriting their SQL predicates. Safely encode locales containing NUL characters or the reserved identity prefix during writes and snapshot restoration.

## 3.0.3

### Patch Changes

- 3c1fbc6: Remove the obsolete SQLite WASM dependency, public schema initializer, and special handling for unsupported legacy database artifacts. The SDK database API uses Lix through Kysely's PostgreSQL query compiler.

## 3.0.2

### Patch Changes

- b012f5e: Update the SDK's Lix engine dependency to 0.12.3, fixing Node.js worker startup when hosts provide worker-incompatible runtime flags.

## 3.0.1

### Patch Changes

- 78ad386: Update the SDK's Lix engine dependency to 0.12.2, including the Node.js WASM fallback for musl-based environments.

## 3.0.0

### Major Changes

- aaf4e05: Add `openProject({ lix })` so applications can provide and own the Lix used by an Inlang project.

  Legacy v1 messages now preserve selectors and variant matches when converted to v2. In-memory project blobs serialize messages and variants as nested bundles and remain able to restore the previous flat snapshot format.

  BREAKING: Inlang's registered Lix schema keys are now namespaced as `inlang_bundle`, `inlang_message`, and `inlang_variant`. Existing Lix data stored under the previous unprefixed schema keys is not migrated automatically.

  BREAKING: Inlang no longer registers or exposes its own key-value and active-account schemas. `project.id` uses Lix's built-in `lix_id`. The Inlang-specific `account`, `lixKeyValues`, `Account`, and `NewKeyValue` compatibility APIs have been removed; callers own account selection through Lix.

  `project.lix` is the unmodified `Lix` instance itself. Inlang does not add a `db` facade or define any APIs under `project.lix`.

### Minor Changes

- 5d7b021: Add a browser-safe `@inlang/sdk/browser` entrypoint for caller-owned Lix projects. It exposes `openProject`, project and message types, nested-bundle query utilities, and atomic Lix batches without exporting Node.js directory APIs.
- 7ea66f8: Upgrade to `@lix-js/sdk` 0.11 and store inlang bundles, messages, and variants in the Lix in-memory engine.

### Patch Changes

- fb46551: Batch fresh-project imports to reduce SQLite round trips during compilation.

## 2.10.2

### Patch Changes

- eccea01: Fix Windows project sync path normalization to avoid rewriting unchanged files.

## 2.10.1

### Patch Changes

- bf2af52: Add new import/export API support with namespace path patterns while keeping legacy next-intl project settings and `{languageTag}` path patterns compatible.

  Allow export files to override the configured path pattern via metadata so plugins can safely route individual files without mutating project settings.

## 2.10.0

### Minor Changes

- 6680ac1: fix `saveProjectToDirectory` throwing `pathPattern.replace is not a function` when a plugin's `pathPattern` is a namespace object (https://github.com/opral/inlang/issues/4356)

  - `ExportFile` has a new optional `metadata` field — the counterpart of `ImportFile.toBeImportedFilesMetadata`. Plugins can use it to pass information to the writer, e.g. the namespace an exported file belongs to.
  - `saveProjectToDirectory` resolves namespaced `pathPattern` objects (`Record<namespace, pattern>`) via `ExportFile.metadata.namespace` and writes each exported file to the path its namespace pattern describes. Files without a resolvable namespace fall back to being written by `file.name` instead of throwing.
  - `@inlang/plugin-i18next` now provides `metadata: { namespace }` for namespaced export files. Saving a multi-namespace i18next project requires this plugin version (older plugin versions no longer crash but fall back to writing `{namespace}-{locale}.json` files relative to the project directory).

## 2.9.3

### Patch Changes

- a853d5f: Clarify the SDK README and generated project README positioning for `.inlang` as the canonical localization file format with version control via lix.

## 2.9.2

### Patch Changes

- b292999: Update `@lix-js/sdk` to `0.4.10` and `uuid` to `^14.0.0` to address GHSA-w5hq-g745-h8pq.

## 2.9.1

### Patch Changes

- bcd4335: Update `@lix-js/sdk` to `0.4.9` and remove the noisy deprecated Kysely `orderBy("... asc|desc")` usage from the SDK path.

## 2.9.0

### Minor Changes

- f1dfc25: Update `@lix-js/sdk` to `0.4.8`, bump `kysely` to `^0.28.12`, and raise the advertised Node.js support range to `>=20.0.0` to match the updated dependency requirements.

## 2.8.0

### Minor Changes

- 6e6ee7f: Remove the remaining telemetry code from the SDK. Project loading and project creation no longer ship or persist telemetry-related logic, and the `telemetry` project setting has been removed from the SDK schema and docs.

## 2.7.0

### Minor Changes

- 6defee0: Extend the SDK pattern AST with richer markup metadata.

  Added support for markup `options` and `attributes` on:

  - `markup-start`
  - `markup-end`
  - `markup-standalone`

  Also introduced an `Attribute` schema type (`Literal | true`) for flag-style and valued attributes.

  This is additive and keeps existing markup patterns compatible while enabling richer MF2-aligned markup data in the SDK model.

## 2.6.2

### Patch Changes

- 9553df6: Remove the `fileQueueSettled` wait after the initial filesystem sync in `loadProjectFromDirectory` to avoid hangs when file operations never settle.

## 2.6.1

### Patch Changes

- c6708ee: Update documentation links to the latest lix.dev and GitHub repository locations.

## 2.6.0

### Minor Changes

- c1d8e5a: The SDK now writes `.meta.json` with the highest SDK version that has touched a
  project and uses it to safely handle forward migrations.

  On load, if the stored version is older, metadata + generated files are refreshed without exporting;if it's newer, they are left untouched to avoid downgrades.

  Directory change:

  ```txt
  project.inlang/
    settings.json
    README.md
    .gitignore
    .meta.json   <-- new
  ```

## 2.5.0

### Minor Changes

- e9d7a74: Update generated `.inlang` gitignore to ignore everything except `settings.json`.
- 65c33c2: emit a README.md in .inlang project folders to help coding agents understand the folder
- 323295a: Stop writing `project_id` to unpacked project directories and document unstable ids for unpacked projects.

### Patch Changes

- 9d73b90: Await the Lix file queue before closing or exiting to avoid "DB has been closed" errors in CLI workflows.

  Refs: https://github.com/opral/paraglide-js/issues/526

- 2e8318b: Fix jsonb result parsing to avoid coercing JSON-looking text in patterns. References https://github.com/opral/paraglide-js/issues/571.

## 2.4.9

### Patch Changes

- 22089a2: Fix error when running the machine translate using `pathPattern` as an array

  ***

  When running command `{npx|pnpm} inlang machine translate ...` is throwing an error when the `pathPattern` value is Array like this:

  ```json
  {
  	"$schema": "https://inlang.com/schema/project-settings",
  	"baseLocale": "es",
  	"locales": ["es", "en"],
  	"modules": [
  		"https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
  		"https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js"
  	],
  	"plugin.inlang.messageFormat": {
  		// In this example, "pathPattern" is array
  		"pathPattern": [
  			"./messages/{locale}/home.json",
  			"./messages/{locale}/shopping-cart.json"
  		]
  	}
  }
  ```

  ### Error message

  ```bash
  deriancordoba@DerianCordoba project % pnpm machine-translate

  > project@0.0.1 machine-translate /Users/deriancordoba/Developer/project
  > inlang machine translate --project project.inlang

  ✔ Machine translate complete.

   ERROR   pathPattern.replace is not a function

    at saveProjectToDirectory (node_modules/.pnpm/@inlang+cli@3.0.11/node_modules/@inlang/cli/dist/main.js:56516:81)
    at async _Command.<anonymous> (node_modules/.pnpm/@inlang+cli@3.0.11/node_modules/@inlang/cli/dist/main.js:56647:5)

   ELIFECYCLE  Command failed with exit code 1.
  ```

## 2.4.8

### Patch Changes

- 56acb22: fix: loading plugins from cache in directory mode https://github.com/opral/inlang-paraglide-js/issues/498
- Updated dependencies [aa4d69e]
  - @lix-js/sdk@0.4.7

## 2.4.7

### Patch Changes

- bd2c366: improve: sample telemetry event to reduce number of events
- Updated dependencies [f634538]
  - @lix-js/sdk@0.4.6

## 2.4.6

### Patch Changes

- 49a7880: improve: forward telemetry settings to lix

## 2.4.5

### Patch Changes

- 083ff1f: fix: `loadProjectFromDirectory()` should return errors from `loadProject()`
- Updated dependencies [275d87e]
- Updated dependencies [dc92f56]
- Updated dependencies [c1ed545]
  - @lix-js/sdk@0.4.5

## 2.4.4

### Patch Changes

- Updated dependencies [85478f8]
  - @lix-js/sdk@0.4.4

## 2.4.3

### Patch Changes

- Updated dependencies [8ce6666]
  - @lix-js/sdk@0.4.3

## 2.4.2

### Patch Changes

- Updated dependencies [59f6c92]
  - @lix-js/sdk@0.4.2

## 2.4.1

### Patch Changes

- 5a991cd: fix sdk&sherlock on win

## 2.4.0

### Minor Changes

- f01927c: bugfixing

## 2.3.0

### Minor Changes

- c0b857a: stable lix ids when opening a project with `loadProjectFromDirectory()` https://github.com/opral/inlang/issues/228

### Patch Changes

- 91ba4eb: fix: Cannot mkdir project.inlang/cache/puligns in window OSS using git bash terminal

  https://github.com/opral/inlang-paraglide-js/issues/377

- Updated dependencies [c0b857a]
  - @lix-js/sdk@0.4.1

## 2.2.2

### Patch Changes

- c53b1a9: fix: type of LocalVariable

## 2.2.1

### Patch Changes

- f51736f: fix: plugin imports on Bun
- adf7d6c: fix `saveProjectToDirectory` to have proper backwards compatibility and respect `pathPattern` file location`

## 2.2.0

### Minor Changes

- fc41e71: remove sentry

  the overhead of sentry is too high for the inlang sdk. errors that occur are eventually reported by apps.

## 2.1.3

### Patch Changes

- Updated dependencies [1c84afb]
- Updated dependencies [175f7f9]
  - @lix-js/sdk@0.4.0

## 2.1.2

### Patch Changes

- 61b9782: update the description of depreacted settings props `sourceLanguageTag` and `languageTags` to clarify that the properties should be kept in place as long as inlang apps are used that have the inlang SDK v1 as a dependency
- Updated dependencies [b87f8a8]
  - sqlite-wasm-kysely@0.3.0
  - @lix-js/sdk@0.3.5

## 2.1.1

### Patch Changes

- Updated dependencies [31e8fb8]
  - sqlite-wasm-kysely@0.2.0
  - @lix-js/sdk@0.3.4

## 2.1.0

### Minor Changes

- 57f9e7f: adds a gitignore when calling `saveProjectToDirectory`

### Patch Changes

- 8af8ba9: improve performance: only write db changes to lix on close
- 4444034: fix: replaced wrong variable

  closes https://github.com/opral/inlang-paraglide-js/issues/310

  This bug prevented the SDK from working on Windows due to a POSIX path conversion being performed but not used later.

  ```diff
  // inlang/packages/sdk/src/project/loadProjectFromDirectory.ts:550
  await args.lix.db
      .insertInto("file") // change queue
      .values({
  -       path: path,
  +       path: posixPath,
          data: new Uint8Array(data),
      })
  ```

- fa94c1f: improve: beautified json when creating a new project
- Updated dependencies [7fd8092]
  - @lix-js/sdk@0.3.3

## 2.0.0

### Patch Changes

- Updated dependencies [d71b3c7]
  - @lix-js/sdk@0.3.2
