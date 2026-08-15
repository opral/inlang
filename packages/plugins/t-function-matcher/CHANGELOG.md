# @inlang/plugin-t-function-matcher

## 2.0.26

### Patch Changes

- Updated dependencies [78ad386]
  - @inlang/sdk@3.0.1

## 2.0.25

### Patch Changes

- Updated dependencies [fb46551]
- Updated dependencies [aaf4e05]
- Updated dependencies [5d7b021]
- Updated dependencies [7ea66f8]
  - @inlang/sdk@3.0.0

## 2.0.24

### Patch Changes

- Updated dependencies [eccea01]
  - @inlang/sdk@2.10.2

## 2.0.23

### Patch Changes

- Updated dependencies [bf2af52]
  - @inlang/sdk@2.10.1

## 2.0.22

### Patch Changes

- Updated dependencies [6680ac1]
  - @inlang/sdk@2.10.0

## 2.0.21

### Patch Changes

- Updated dependencies [a853d5f]
  - @inlang/sdk@2.9.3

## 2.0.20

### Patch Changes

- Updated dependencies [b292999]
  - @inlang/sdk@2.9.2

## 2.0.19

### Patch Changes

- Updated dependencies [bcd4335]
  - @inlang/sdk@2.9.1

## 2.0.18

### Patch Changes

- Updated dependencies [f1dfc25]
  - @inlang/sdk@2.9.0

## 2.0.17

### Patch Changes

- Updated dependencies [6e6ee7f]
  - @inlang/sdk@2.8.0

## 2.0.16

### Patch Changes

- Updated dependencies [6defee0]
  - @inlang/sdk@2.7.0

## 2.0.15

### Patch Changes

- Updated dependencies [9553df6]
  - @inlang/sdk@2.6.2

## 2.0.14

### Patch Changes

- Updated dependencies [c6708ee]
  - @inlang/sdk@2.6.1

## 2.0.13

### Patch Changes

- Updated dependencies [c1d8e5a]
  - @inlang/sdk@2.6.0

## 2.0.12

### Patch Changes

- Updated dependencies [e9d7a74]
- Updated dependencies [65c33c2]
- Updated dependencies [9d73b90]
- Updated dependencies [2e8318b]
- Updated dependencies [323295a]
  - @inlang/sdk@2.5.0

## 2.0.11

### Patch Changes

- Updated dependencies [22089a2]
  - @inlang/sdk@2.4.9

## 2.0.10

### Patch Changes

- Updated dependencies [56acb22]
  - @inlang/sdk@2.4.8

## 2.0.9

### Patch Changes

- Updated dependencies [bd2c366]
  - @inlang/sdk@2.4.7

## 2.0.8

### Patch Changes

- Updated dependencies [49a7880]
  - @inlang/sdk@2.4.6

## 2.0.7

### Patch Changes

- Updated dependencies [083ff1f]
  - @inlang/sdk@2.4.5

## 2.0.6

### Patch Changes

- @inlang/sdk@2.4.4

## 2.0.5

### Patch Changes

- @inlang/sdk@2.4.3

## 2.0.4

### Patch Changes

- @inlang/sdk@2.4.2

## 2.0.3

### Patch Changes

- 73cc245: fix: key name of sherlock extension

## 2.0.2

### Patch Changes

- 856f1ef: fix export of meta config for sherlock

## 2.0.1

### Patch Changes

- Updated dependencies [5a991cd]
  - @inlang/sdk@2.4.1

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

## 1.0.10

### Patch Changes

- Updated dependencies [c0b857a]
- Updated dependencies [91ba4eb]
  - @inlang/sdk@2.3.0

## 1.0.9

### Patch Changes

- Updated dependencies [c53b1a9]
  - @inlang/sdk@2.2.2

## 1.0.8

### Patch Changes

- Updated dependencies [f51736f]
- Updated dependencies [adf7d6c]
  - @inlang/sdk@2.2.1

## 1.0.7

### Patch Changes

- Updated dependencies [fc41e71]
  - @inlang/sdk@2.2.0

## 1.0.6

### Patch Changes

- @inlang/sdk@2.1.3

## 1.0.5

### Patch Changes

- Updated dependencies [61b9782]
  - @inlang/sdk@2.1.2

## 1.0.4

### Patch Changes

- @inlang/sdk@2.1.1

## 1.0.3

### Patch Changes

- Updated dependencies [8af8ba9]
- Updated dependencies [57f9e7f]
- Updated dependencies [4444034]
- Updated dependencies [fa94c1f]
  - @inlang/sdk@2.1.0

## 1.0.2

### Patch Changes

- add properties for backwards compatibility

## 1.0.1

### Patch Changes

- @inlang/sdk@2.0.0

## 1.0.0

### Major Changes

- 3d5a454: Upgrade to the @inlang/sdk v2.0.0.

  No breaking change is expected. But, if you encounter issues, fix the version of the plugin to the previous major version.

- upgrade to @inlang/sdk v2 beta

## 0.6.36

### Patch Changes

- @inlang/sdk@0.36.3
- @inlang/plugin@2.4.14

## 0.6.35

### Patch Changes

- Updated dependencies [2fc5feb]
  - @inlang/sdk@0.36.2

## 0.6.34

### Patch Changes

- Updated dependencies [1077e06]
  - @inlang/sdk@0.36.1

## 0.6.33

### Patch Changes

- Updated dependencies [8ec7b34]
- Updated dependencies [05f9282]
  - @inlang/sdk@0.36.0

## 0.6.32

### Patch Changes

- Updated dependencies [8e9fc0f]
  - @inlang/sdk@0.35.9

## 0.6.31

### Patch Changes

- 04e804b: add human readble id tests to plugins

## 0.6.30

### Patch Changes

- Updated dependencies [da7c207]
  - @inlang/sdk@0.35.8

## 0.6.29

### Patch Changes

- f711787: fix t-function matcher extract message should offer no-brace version

## 0.6.28

### Patch Changes

- Updated dependencies [2a5645c]
  - @inlang/sdk@0.35.7

## 0.6.27

### Patch Changes

- Updated dependencies [9d2aa1a]
  - @inlang/sdk@0.35.6

## 0.6.26

### Patch Changes

- Updated dependencies [64e30ee]
  - @inlang/sdk@0.35.5

## 0.6.25

### Patch Changes

- @inlang/sdk@0.35.4

## 0.6.24

### Patch Changes

- @inlang/sdk@0.35.3

## 0.6.23

### Patch Changes

- @inlang/sdk@0.35.2
- @inlang/plugin@2.4.13

## 0.6.22

### Patch Changes

- @inlang/sdk@0.35.1
- @inlang/plugin@2.4.12

## 0.6.21

### Patch Changes

- Updated dependencies [ae47203]
  - @inlang/sdk@0.35.0

## 0.6.20

### Patch Changes

- Updated dependencies [d27a983]
- Updated dependencies [a27b7a4]
  - @inlang/sdk@0.34.10

## 0.6.19

### Patch Changes

- Updated dependencies [a958d91]
  - @inlang/sdk@0.34.9

## 0.6.18

### Patch Changes

- Updated dependencies [10dbd02]
  - @inlang/sdk@0.34.8

## 0.6.17

### Patch Changes

- Updated dependencies [5209b81]
  - @inlang/sdk@0.34.7

## 0.6.16

### Patch Changes

- Updated dependencies [f38536e]
  - @inlang/sdk@0.34.6

## 0.6.15

### Patch Changes

- Updated dependencies [b9eccb7]
  - @inlang/sdk@0.34.5

## 0.6.14

### Patch Changes

- Updated dependencies [2a90116]
  - @inlang/sdk@0.34.4

## 0.6.13

### Patch Changes

- Updated dependencies [bc17d0c]
  - @inlang/sdk@0.34.3
  - @inlang/plugin@2.4.11

## 0.6.12

### Patch Changes

- Updated dependencies [3c959bc]
  - @inlang/sdk@0.34.2

## 0.6.11

### Patch Changes

- @inlang/sdk@0.34.1

## 0.6.10

### Patch Changes

- Updated dependencies [5b8c053]
  - @inlang/sdk@0.34.0

## 0.6.9

### Patch Changes

- @inlang/sdk@0.33.1
- @inlang/plugin@2.4.10

## 0.6.8

### Patch Changes

- Updated dependencies [d573ab8]
  - @inlang/sdk@0.33.0

## 0.6.7

### Patch Changes

- Updated dependencies [bc9875d]
  - @inlang/sdk@0.32.0

## 0.6.6

### Patch Changes

- Updated dependencies [c068dd2]
  - @inlang/sdk@0.31.0

## 0.6.5

### Patch Changes

- Updated dependencies [9b26a31]
  - @inlang/sdk@0.30.0

## 0.6.4

### Patch Changes

- Updated dependencies [62dfa26]
  - @inlang/sdk@0.29.0

## 0.6.3

### Patch Changes

- @inlang/sdk@0.28.3

## 0.6.2

### Patch Changes

- @inlang/sdk@0.28.2

## 0.6.1

### Patch Changes

- @inlang/sdk@0.28.1
- @inlang/plugin@2.4.9

## 0.6.0

### Minor Changes

- df3b735: add astro support

## 0.5.7

### Patch Changes

- Updated dependencies [1e43ae4]
  - @inlang/sdk@0.28.0

## 0.5.6

### Patch Changes

- Updated dependencies [4837297]
  - @inlang/sdk@0.27.0
  - @inlang/plugin@2.4.8

## 0.5.5

### Patch Changes

- @inlang/sdk@0.26.5
- @inlang/plugin@2.4.7

## 0.5.4

### Patch Changes

- 960f8fb70: rename the vscode extension to "Sherlock"
- Updated dependencies [960f8fb70]
  - @inlang/plugin@2.4.6
  - @inlang/sdk@0.26.4

## 0.5.3

### Patch Changes

- @inlang/sdk@0.26.3
- @inlang/plugin@2.4.5

## 0.5.2

### Patch Changes

- @inlang/sdk@0.26.2
- @inlang/plugin@2.4.4

## 0.5.1

### Patch Changes

- @inlang/sdk@0.26.1

## 0.5.0

### Minor Changes

- 871972019: update README

## 0.4.9

### Patch Changes

- Updated dependencies [676c0f905]
  - @inlang/sdk@0.26.0

## 0.4.8

### Patch Changes

- Updated dependencies [87bed968b]
- Updated dependencies [23ca73060]
  - @inlang/sdk@0.25.0

## 0.4.7

### Patch Changes

- @inlang/sdk@0.24.1

## 0.4.6

### Patch Changes

- Updated dependencies [c38faebce]
  - @inlang/sdk@0.24.0
  - @inlang/plugin@2.4.3

## 0.4.5

### Patch Changes

- Updated dependencies [b920761e6]
  - @inlang/sdk@0.23.0
  - @inlang/plugin@2.4.2

## 0.4.4

### Patch Changes

- Updated dependencies [cd29edb11]
  - @inlang/sdk@0.22.0

## 0.4.3

### Patch Changes

- Updated dependencies [e20364a46]
  - @inlang/sdk@0.21.0
  - @inlang/plugin@2.4.1

## 0.4.2

### Patch Changes

- Updated dependencies [bc5803235]
  - @inlang/sdk@0.20.0

## 0.4.1

### Patch Changes

- Updated dependencies [8b05794d5]
  - @inlang/sdk@0.19.0

## 0.4.0

### Minor Changes

- a2f8e1044: rename id's of syntax matcher

## 0.3.0

### Minor Changes

- 39beea7dd: change return type of extractMessageOptions

### Patch Changes

- Updated dependencies [cafff8748]
  - @inlang/sdk@0.17.0
