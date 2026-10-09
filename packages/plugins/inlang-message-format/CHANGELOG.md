# @inlang/plugin-message-format

## 4.5.0

### Minor Changes

- 1af7636: Keep functions on placeholders. Export used to drop the function of every placeholder, so ICU `{count, plural, offset:1 other {You and # others}}` imported by `@inlang/plugin-icu1` and exported to this format became `You and {count} others`, which displays `count` instead of `count - 1`, and `{n, number, percent}` lost its style.

  Placeholders with a function are now written like local declarations, `{count: icu:pound offset=1}` or `{n: number style=percent}`, and imported back. Option values are literals (`style=percent`), quoted literals (`skeleton=|yyyy MMM d|`) or variables (`currency=$priceCurrency`). Placeholders without a function are written exactly as before. A placeholder in an existing file is only read as a function call when it has this form, with a space after the colon, so `{user:name}` stays a variable named `user:name`. Older versions of this plugin (4.4.5 and earlier) read the new `{count: icu:pound offset=1}` placeholders as variable names, so update the plugin everywhere a project's files are read.

### Patch Changes

- 193c172: Exports keep the text of unchanged messages. When the SDK passes the current files to `exportFiles` (SDK 4), a message whose data didn't change keeps its exact text in the file: legacy shapes, escaping, inline arrays, key order, indentation, line endings and a missing `$schema` stay as they are, so that only edited messages change in git. New messages are inserted after the message before them (sorted with `sort`), removed ones are dropped. Without the current file, e.g. for a new locale, the file is written as before. The export is also no longer quadratic in the number of messages.
- 279de69: Keys with dots no longer lose messages, and `sort` no longer reorders variants.

  - Messages whose keys have number segments, e.g. `steps.0` and `steps.1`, were written as an array, `"steps": ["…", "…"]`, which the plugin read back as messages without text. Such arrays are now read as the messages they were written for (`steps.0`, `steps.1`; `null` entries are skipped; an object in such an array is a nested key, also if it has a key named `match`), and number segments are written as object keys, `"steps": { "0": "…", "1": "…" }`. A file with the array keeps it until one of its messages is edited.
  - Variants whose key has a dot, e.g. `count=1.5` or `channel=v1.beta`, were split at the dot, `"count=1": [null, …, "…"]` or `"channel=v1": { "beta": "…" }`, and lost their text on the next import. Such variants are now read with the dot (`count=1.5`) and written with it again. A number after the dot is read as a number, so `count=1.05`, which was written at index 5, is read as `count=1.5`.
  - A complex message `a` next to keys that start with `a.` was written into their object or array: `"a": { "0": { "declarations": …, "selectors": …, "match": …, "x": "…" }, "b": "…" }` for `a.b`, `a`, `a.0.x`; `"a": [{ …, "x": "…" }, { "y": "…" }]` for `a`, `a.0.x`, `a.1.y`; and `"a": [{ "0": { … }, "declarations": …, … }]` for a complex message `a.0`. Earlier versions read the first as other messages (`a.0.match.count=one`, …) without `a`, or failed if a locale had `"selectors": []`, and the others without `a.0.x`, `a.1.y` or `a.0`. These shapes are now read as the messages they were written for; keys in them that are no message are ignored. Other keys of a complex message as it can be written by hand, e.g. `"description"` in `[{ "declarations": …, "selectors": …, "match": …, "description": "…" }]`, are ignored as before (so `a.0.x` alone, which earlier versions wrote that way, is not recovered). A value that is neither a string nor a complex message fails the import with an error that names its key.
  - A message whose key starts with the key of another message, e.g. `a.b` next to `a`, was dropped on export. It is now written with the rest of its key flat, `"a.b"`, in the deepest object it fits in. Keys with an empty segment (`a.`, `a..b`) are written as they are.
  - `sort` sorted everything in a file, including the variants of a message, which put the catch-all `*` first, where runtimes that try the variants in file order (Paraglide JS 2.26) always select it. It now only sorts the keys of messages and of the objects that nest them; the variants, declarations and selectors of a message keep their order. Files that earlier versions wrote that way are imported with the variants in the order the export writes them (a variant that is never selected moves before the catch-all), so runtimes select the right variant without editing the file, and the file keeps its bytes.

- 9be7627: Import and export exact numbers (ICU `=0`) next to a plural.

  - Un-annotated local declarations such as `local countPluralExact = count` import instead of crashing the parser. This is the shape `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}` and editors create when a user adds an exact number. Quoted literal locals (`local greeting = "hello"`) round-trip too, with `"` and `\` escaped.
  - Selectors are still exported alphabetically, so files don't change when the plugin is upgraded, with one exception: an exact-number selector (an un-annotated local of the same input, or the input itself) is written directly before its plural, also with several plurals on one input (`countPluralExact`, `countPlural`, `countPlural1Exact`, `countPlural1`). Selector order is the MessageFormat 2 preference order, and the exact number has to come first to win over a category that also selects the number (French "one" selects 0). Files change only where the old output was wrong: earlier versions wrote such a message with the plural first, e.g. `"selectors": ["countPlural", "countPluralExact"]`, now `"selectors": ["countPluralExact", "countPlural"]`. With the default names (`countPluralExact`), earlier versions couldn't even read that output back, because `local countPluralExact = count` crashed their parser.

- 9788220: Files keep their form when a message is a plural or select in one locale and a plain string in another, and variants are written in an order runtimes select them in.

  - A plain string stays a plain string, e.g. German `"files_deleted": "{count} Dateien gelöscht"` next to an English plural. Earlier versions rewrote it on the first export into `[{ "declarations": […], "selectors": [], "match": { "count=*": "{count} Dateien gelöscht" } }]` and on the next export into `"selectors": ["count"]`. Files that already have either complex form keep it: a key that only matches `*` is not added to a `selectors` list the file has. Only the complex form for a plain string without placeholders (`"match": ["…"]`) is written as the plain string again, the same message.
  - A plain string with a placeholder that another locale declares as a local, e.g. `{formattedAmount}`, no longer adds an `input formattedAmount` declaration to the other locales' files.
  - An `=0` form that an editor adds to a plural is the newest variant and was written after the catch-all `*`, where runtimes that try the forms in file order (Paraglide JS 2.26) never select it. If a variant can be selected but an earlier variant always wins over it (checked with the locale's plural rules, e.g. French `one` also selects 0), that variant is now written before the variants MessageFormat 2 prefers less (exact and literal keys before plural categories, the catch-all last), e.g. the `=0` form before the catch-all. The other variants keep their order, and every other message is kept byte for byte, also where variants overlap on purpose. Plural `offset`s and locale tags like `pt_BR` are taken into account.

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

## 4.4.5

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- Updated dependencies [68eefaf]
- Updated dependencies [56891d6]
- Updated dependencies [5df91b6]
  - @inlang/sdk@3.1.0

## 4.4.4

### Patch Changes

- 5fd9f83: Fix message-format round trips by trimming whitespace around every selector match, preserving placeholder inputs that follow existing declarations, and exporting without mutating declaration or variant-match order.

## 4.4.3

### Patch Changes

- 9c719b3: Speed up importing large message-format projects by indexing bundles by id.

## 4.4.2

### Patch Changes

- 9c719b3: Speed up importing large message-format projects by indexing bundles by id.

## 4.4.1

### Patch Changes

- 1def3b3: Infer input declarations referenced by local message-format declarations.

## 4.4.0

### Minor Changes

- b65899b: Local formatter declarations now support MF2-style variable option values using `$variable`, and declaration options now allow optional whitespace around `=`.

  This fixes cases like `local formattedAmount = amount: number style=currency currency = $priceCurrency notation=compact`, which previously either dropped the `currency` option because of the spaces or treated `priceCurrency` as a literal string instead of an input variable.

  The change is non-breaking:

  - existing literal options like `currency=USD` still work
  - existing `number style=currency` usage is unchanged
  - variable-valued options are only enabled when the value uses the new `$variable` syntax
  - exported declarations now round-trip variable options as `key=$variable`

## 4.3.0

### Minor Changes

- 6defee0: Improve markup support in the inlang message format plugin.

  - Added roundtrip support for markup `options` and `attributes`.
  - Added support for quoted literal values (`|...|`) and escaped content (`\|`, `\\`) in markup option and attribute values.
  - Added support for variable-valued markup options (`key=$variable`) with declaration inference for referenced variables.
  - Added validation for malformed markup placeholders.

## 4.2.0

### Minor Changes

- 550fc0f: Add support for escaping literal `{}` and backslashes in message patterns. Use `\{` and `\}` for literal braces, and `\\` for a literal backslash.

  Example:

  ```json
  {
  	"json_object": "\\{\"a\": \"b\", \"c\": \"d\"\\}"
  }
  ```

## 4.1.0

### Minor Changes

- 27ae0f1: add optional `sort` setting to sort message keys when exporting files (ascending or descending)

  https://github.com/opral/paraglide-js/issues/570

## 4.0.0

### Major Changes

- 0b829f8: Support for nesting of message keys

  ```json
  //messages/en.json
  {
  	"hello_world": "Hello World!",
  	"greeting": "Good morning {name}!",
  	"nested": {
  		"key": "Nested key"
  	}
  }
  ```

  **BREAKING**

  Complex messages that have variants need to be wrapped in an array to be distinguished from nested keys.

  ```diff
  //messages/en.json
  {
    "hello_world": "Hello World!",
  +  "complex_message": [
      {
        "declarations": ["input count", "local countPlural = count: plural"],
        "selectors": ["countPlural"],
        "match": {
          "countPlural=one": "There is one item",
          "countPlural=other": "There are {count} items"
        }
      }
  +  ]
  }
  ```

### Minor Changes

- 2d823c8: allow arbitrary message bundle keys https://github.com/opral/inlang-paraglide-js/issues/285

## 3.2.1

### Patch Changes

- b9442e3: - update `exportFiles` to emit sorted output to have less diff noise

## 3.2.0

### Minor Changes

- ff871c4: add support for local variable options and persists selectors

## 3.1.1

### Patch Changes

- 8132942: feat: support array of paths for pathPattern in inlang-message-format plugin

  ```diff
  // settings.json

  {
    "plugin.inlang.messageFormat": {
  +    pathPattern: ["/defaults/{locale}.json", "/translations/{locale}.json"],
    }
  }

  ```

## 3.1.0

### Minor Changes

- 4adfd4d: re-enables adding the `$schema` key to exported files

  the `$schema` prop enables IDEs to provide autocompletion and type checking for the message files

### Patch Changes

- 997f55b: update the fileschema for to variants

  closes https://github.com/opral/inlang-paraglide-js/issues/319

## 3.0.3

### Patch Changes

- fix: re-add `loadMessages` and `saveMessages` again for backwards compatibility

## 3.0.2

### Patch Changes

- add `displayName` and `description` for backwards compatibility

## 3.0.1

### Patch Changes

- added old `loadMessages` and `saveMessages` functions for backwards compatibility

## 3.0.0

### Major Changes

- upgrade to @inlang/sdk v2 beta

## 2.2.0

### Minor Changes

- 732430d: Error on messages file json parse failures

## 2.1.1

### Patch Changes

- 4837297: File locking for concurrent message updates through the load/store plugin api
  Auto-generated human-IDs and aliases - only with experimental: { aliases: true }

## 2.1.0

### Minor Changes

- 0c272619a: types loosened to allow for new/unknown properties

## 2.0.0

### Major Changes

- ca96a2461: The message format is now human readable and can be edited manually. The plugin will automatically convert the message format to the internal format.

  1. Add a filePathPattern property to the inlang project

  ```diff
  "plugin.inlang.messageFormat": {
    "filePath": "./src/messages.json",
  +  "pathPattern": "./messages/{languageTag}.json"
  }
  ```

  2. Run `npx paraglide-js compile`

  The compile command will automatically convert existing messages from the `messages.json` file to the new format.

  3. Delete the `messages.json` and `filePath` property in the inlang project

  ```diff
  "plugin.inlang.messageFormat": {
  -  "filePath": "./src/messages.json",
    "pathPattern": "./messages/{languageTag}.json"
  }
  ```

## 1.4.0

### Minor Changes

- c4afa50ca: fix: don't rely on { recursive: true } as the implemention differs per environment

## 1.3.0

### Minor Changes

- 3016bfab8: improve: use new `settingsSchema` property for plugins to provide a shorter feedback loop when the settings are invalid.
- 1d0d7fa05: fix: https://github.com/opral/inlang/issues/1530

## 1.2.0

### Minor Changes

- 091db828e: fix: don't rely on { recursive: true } as the implemention differs per environment

## 1.1.0

### Minor Changes

- 79c809c8f: improve: the plugin is able to create directories if a the storage file does not exist yet.

  If a user initializes a new project that uses `./.inlang/plugin.inlang.messageFormat/messages.json` as path but the path does not exist yet, the plugin will now create all directories that are non-existend of the path yet and the `messages.json` file itself. This improvement makes getting started with the plugin easier.
