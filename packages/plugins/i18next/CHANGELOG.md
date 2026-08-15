# @inlang/plugin-i18next

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
