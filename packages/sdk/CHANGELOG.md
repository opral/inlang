# @inlang/sdk

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
