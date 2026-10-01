# @inlang/plugin-next-intl

## 2.2.1

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- Updated dependencies [68eefaf]
  - @inlang/sdk@3.0.7

## 2.2.0

### Minor Changes

- 25747cd: Improve Sherlock message reference matching for next-intl translator aliases and quoted object namespace assignments.

  The matcher now resolves simple aliases like `const translate = t`, chained aliases, renamed destructured translation functions, and direct `getTranslations({ namespace })` assignments with single- or double-quoted namespace values.

## 2.1.0

### Minor Changes

- bf2af52: Add new import/export API support with namespace path patterns while keeping legacy next-intl project settings and `{languageTag}` path patterns compatible.

  Allow export files to override the configured path pattern via metadata so plugins can safely route individual files without mutating project settings.

## 2.0.1

### Patch Changes

- a410265: Added support for multiple useTranslations function names

## 2.0.0

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

## 1.4.0

### Minor Changes

- default to `{}` single brackets

## 1.3.49

### Patch Changes

- c26aac4: refactor icon

## 1.3.48

### Patch Changes

- @inlang/sdk@0.36.3

## 1.3.47

### Patch Changes

- Updated dependencies [2fc5feb]
  - @inlang/sdk@0.36.2

## 1.3.46

### Patch Changes

- Updated dependencies [1077e06]
  - @inlang/sdk@0.36.1

## 1.3.45

### Patch Changes

- Updated dependencies [8ec7b34]
- Updated dependencies [05f9282]
  - @inlang/sdk@0.36.0

## 1.3.44

### Patch Changes

- Updated dependencies [8e9fc0f]
  - @inlang/sdk@0.35.9

## 1.3.43

### Patch Changes

- 04e804b: add human readble id tests to plugins
- aa91877: add more extract options

## 1.3.42

### Patch Changes

- Updated dependencies [da7c207]
  - @inlang/sdk@0.35.8

## 1.3.41

### Patch Changes

- 2b36271: add changeset

## 1.3.40

### Patch Changes

- Updated dependencies [2a5645c]
  - @inlang/sdk@0.35.7

## 1.3.39

### Patch Changes

- Updated dependencies [9d2aa1a]
  - @inlang/sdk@0.35.6

## 1.3.38

### Patch Changes

- 6a37426: support more flexible hooks argument passing
- c780d2f: improve namespace parser to catch hooks sequentially

## 1.3.37

### Patch Changes

- Updated dependencies [64e30ee]
  - @inlang/sdk@0.35.5

## 1.3.36

### Patch Changes

- @inlang/sdk@0.35.4

## 1.3.35

### Patch Changes

- @inlang/sdk@0.35.3

## 1.3.34

### Patch Changes

- @inlang/sdk@0.35.2

## 1.3.33

### Patch Changes

- @inlang/sdk@0.35.1

## 1.3.32

### Patch Changes

- Updated dependencies [ae47203]
  - @inlang/sdk@0.35.0

## 1.3.31

### Patch Changes

- Updated dependencies [d27a983]
- Updated dependencies [a27b7a4]
  - @inlang/sdk@0.34.10

## 1.3.30

### Patch Changes

- Updated dependencies [a958d91]
  - @inlang/sdk@0.34.9

## 1.3.29

### Patch Changes

- Updated dependencies [10dbd02]
  - @inlang/sdk@0.34.8

## 1.3.28

### Patch Changes

- Updated dependencies [5209b81]
  - @inlang/sdk@0.34.7

## 1.3.27

### Patch Changes

- Updated dependencies [f38536e]
  - @inlang/sdk@0.34.6

## 1.3.26

### Patch Changes

- Updated dependencies [b9eccb7]
  - @inlang/sdk@0.34.5

## 1.3.25

### Patch Changes

- Updated dependencies [2a90116]
  - @inlang/sdk@0.34.4

## 1.3.24

### Patch Changes

- f37599b: change README

## 1.3.23

### Patch Changes

- Updated dependencies [bc17d0c]
  - @inlang/sdk@0.34.3

## 1.3.22

### Patch Changes

- 1abcc3f: update docs

## 1.3.21

### Patch Changes

- Updated dependencies [3c959bc]
  - @inlang/sdk@0.34.2

## 1.3.20

### Patch Changes

- @inlang/sdk@0.34.1

## 1.3.19

### Patch Changes

- Updated dependencies [5b8c053]
  - @inlang/sdk@0.34.0

## 1.3.18

### Patch Changes

- @inlang/sdk@0.33.1

## 1.3.17

### Patch Changes

- Updated dependencies [d573ab8]
  - @inlang/sdk@0.33.0

## 1.3.16

### Patch Changes

- bc00427: fix typo
- Updated dependencies [bc9875d]
  - @inlang/sdk@0.32.0

## 1.3.15

### Patch Changes

- Updated dependencies [c068dd2]
  - @inlang/sdk@0.31.0

## 1.3.14

### Patch Changes

- Updated dependencies [9b26a31]
  - @inlang/sdk@0.30.0

## 1.3.13

### Patch Changes

- Updated dependencies [62dfa26]
  - @inlang/sdk@0.29.0

## 1.3.12

### Patch Changes

- @inlang/sdk@0.28.3

## 1.3.11

### Patch Changes

- 923a4bb: fix discord link

## 1.3.10

### Patch Changes

- @inlang/sdk@0.28.2

## 1.3.9

### Patch Changes

- @inlang/sdk@0.28.1

## 1.3.8

### Patch Changes

- Updated dependencies [1e43ae4]
  - @inlang/sdk@0.28.0

## 1.3.7

### Patch Changes

- f3b0489: fix typo

## 1.3.6

### Patch Changes

- 4837297: File locking for concurrent message updates through the load/store plugin api
  Auto-generated human-IDs and aliases - only with experimental: { aliases: true }
- Updated dependencies [4837297]
  - @inlang/sdk@0.27.0

## 1.3.5

### Patch Changes

- @inlang/sdk@0.26.5

## 1.3.4

### Patch Changes

- 960f8fb70: rename the vscode extension to "Sherlock"
  - @inlang/sdk@0.26.4

## 1.3.3

### Patch Changes

- d9cf66170: update docs for apps and plugins
- b7344152a: updated the docs

## 1.3.2

### Patch Changes

- @inlang/sdk@0.26.3

## 1.3.1

### Patch Changes

- @inlang/sdk@0.26.2

## 1.3.0

### Minor Changes

- 49dd676eb: Support getTranslations with object syntax for namespace

## 1.2.6

### Patch Changes

- @inlang/sdk@0.26.1

## 1.2.5

### Patch Changes

- Updated dependencies [676c0f905]
  - @inlang/sdk@0.26.0

## 1.2.4

### Patch Changes

- Updated dependencies [87bed968b]
- Updated dependencies [23ca73060]
  - @inlang/sdk@0.25.0

## 1.2.3

### Patch Changes

- @inlang/sdk@0.24.1

## 1.2.2

### Patch Changes

- Updated dependencies [c38faebce]
  - @inlang/sdk@0.24.0

## 1.2.1

### Patch Changes

- Updated dependencies [b920761e6]
  - @inlang/sdk@0.23.0

## 1.2.0

### Minor Changes

- 7b9f920df: Improved parser to match also `getTranslations`

## 1.1.3

### Patch Changes

- Updated dependencies [cd29edb11]
  - @inlang/sdk@0.22.0

## 1.1.2

### Patch Changes

- Updated dependencies [e20364a46]
  - @inlang/sdk@0.21.0

## 1.1.1

### Patch Changes

- Updated dependencies [bc5803235]
  - @inlang/sdk@0.20.0

## 1.1.0

### Minor Changes

- bd2e47753: Initial next-intl plugin version
