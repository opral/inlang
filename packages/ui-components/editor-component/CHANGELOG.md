# @inlang/message-bundle-component

## 13.0.0

### Major Changes

- 1e62fd1: Composable editor components for list-style translation UIs.

  New components: `<inlang-pattern-view>` (read-only pattern with variable tokens and real bold/italic/underline for markup), `<inlang-message-forms>` (list, grid or tabbed grid of a message's variants with plural example numbers and "+ Add form" buttons for missing required forms; `select-variant` / `add-variant` events) and `<inlang-message-preview>` (inputs derived from the bundle's input variables and the formatted output, optionally next to the reference language; `values-change` / `variant-match` events).

  New helpers: `pluralExamples`, `selectVariant`, `formatPattern` / `formatMessage`, `previewInputs`. The translation rules (required forms, missing / unknown variables, missing markup) are not part of the component: `<inlang-message-forms>` uses `selectorGroups` / `missingVariants` of `@inlang/sdk` (imported from `@inlang/sdk/browser`), the same rules as the SDK's `missing-variant` check, and hosts use `checkBundle` / `checkTranslation` for problems. Requires `@inlang/sdk` ^4.

  `lit` is now a runtime dependency, and test files are no longer published.

  Breaking: the components use the `@inlang/sdk` 4 database rows. The `change` event's `newData` and the `message` / `variants` properties carry `bundle_id` / `message_id` instead of `bundleId` / `messageId`.

  Breaking changes in `<inlang-pattern-editor>`:

  - Expressions and markup are atomic tokens (deleted as a whole). Markup is now preserved instead of being dropped from the pattern, and text between known markup is shown formatted.
  - Styles no longer leak: the global `div` / `p` selectors were removed and all styles are scoped to the element. Padding, min-height, background, font size and colors are themeable via `--inlang-pattern-*` custom properties (current values are the defaults).
  - New `placeholder` and `aria-label` support and an `insertExpression(name)` method. The `variant` property and the `change`, `pattern-editor-focus` and `pattern-editor-blur` events are unchanged.

  Theming: besides colors, hosts can now set borders (`--inlang-pattern-border-width/-color/-hover-border-color/-focus-border-color/-border-radius`), popover font size / radius / shadow (`--inlang-popover-*`), the small radius (`--inlang-radius-small`), the four font sizes (`--inlang-font-size-large/-font-size/-font-size-small/-font-size-caption`), `--inlang-control-height`, `--inlang-forms-row-min-height/-padding` and the size and radius of variable tokens (`--inlang-token-font-size/-token-radius`). Defaults are unchanged. `<inlang-pattern-editor>` has a `forgetEdits()` method for hosts that restore earlier text (undo) while echoes of its own edits may still be pending.

  Selectors: `addSelector(bundle, { variable, kind: "plural" | "ordinal" | "select", values? })` makes a message plural / ordinal / a select in every language (a catch-all match for existing variants, `<variable>Plural` local variable for plurals, empty forms for the `values` of a select in the message of `locale`), `removeSelector(bundle, name, { keep? })` takes it away again and `selectableVariables(bundle)` lists the candidates. All pure, usable with `BundleNested` and database rows.

  `addExactNumber(bundle, { selector, value, locale })` / `removeExactNumber` add and remove an exact-number form (ICU `=0`) of a plural, in the shape `@inlang/plugin-icu1` imports and exports (a `<plural>Exact` local variable before the plural selector in every language, removed again with the last number). `addSelectValue(bundle, { selector, value, locale })` / `removeSelectValue` add or remove one value of a select without touching the selector. New forms are created empty only in the message of `locale` (the reference); other languages need them through the SDK's `missing-variant` rule ("+ Add form") instead of getting empty forms that would export as empty text. Removing removes the forms from every language. `<inlang-message-forms>` shows an exact number and the plural of the same input as one choice and takes `referenceVariants`: the reference's select values and exact numbers are needed in a translation too.

### Minor Changes

- d4cff07: `<inlang-pattern-editor>`: `focus()` right after the editor was created or got a new `variant` focuses it once rendered, so text typed right after "+ Add form" is not lost, and a copy of the pattern passed before (a host re-rendering while a new form is saved) no longer replaces what was typed since. `pluralExamples(locale, type, { exclude })` leaves out numbers that have their own form: with `=0`, English "other" shows 2, 3, 4…; `<inlang-message-forms>` does so for exact numbers and shows an empty form next to filled ones (the SDK's `empty-variant` check) as a warning.
- 9fb780a: Show selector resolver types and offer locale-aware cardinal/ordinal plural categories with examples and a distinct fallback. Preserve custom text matches, validate known plural categories, respect literal digit options, and prevent adding a selector twice.

### Patch Changes

- 5d93f32: Review follow-up:

  - `<inlang-pattern-editor>`: a `variant` with another `id` ("+ Add form") replaces the content and forgets pending echoes, so unsaved text of the previous variant is never saved into the new one. Echoes are compared structurally, so a store that returns patterns with sorted keys (the SDK database) no longer reverts text typed after a token was inserted. A lone `markup-start` is kept, and keys are left to an IME while it composes. Undo stays with the host (documented).
  - `addExactNumber` / `removeExactNumber` find the exact-number selector in any language (no more `countPluralExact1` when only some locales use `=0`). `removeSelector` on a plural removes its exact-number partner. `addSelector` throws for an input that already is a plural and `selectableVariables` no longer offers it; select values get their forms before the catch-all.
  - `selectVariant` and `<inlang-message-forms>` respect an ICU `offset`; `pluralExamples` takes `offset` and returns copies. `<inlang-message-forms>` shows a plural's explicit `other` once.
  - The `@inlang/sdk` peer dependency is published as a caret range.
  - With the SDK's translation-rules review: `<inlang-message-forms>` asks only for required plural categories (French `many` is a quiet "+ Add", so it can still be added). `formatPattern` formats an ICU `#` as the number minus the plural's `offset` ("You and 4 others" for 5 with `offset:1`).

- 4ba81e9: `<inlang-pattern-editor>` keeps stored braces as text when keys arrive before the browser reports the caret. Pressing End and then Backspace (or Delete, or typing) faster than `selectionchange` turned a stored `{name}` between the old and the new caret into a variable. The editor now tells typed text from the text before and after an edit instead of the last known selection, so a deletion never creates a variable, regardless of event timing. Typing or pasting `{name}` still creates one.
- dc3266a: `<inlang-pattern-editor>` keeps braces that are text of the stored pattern as text. An escaped ICU literal such as `It''s '{'literal'}'` imports as the text "It's {literal}", but the editor showed `{literal}` as a variable token and, once the user typed anything in that text, saved it as the variable `literal` (and the host declared it). Only a `{name}` the user types or pastes (also over a selection) becomes a variable now. Braces of the stored text stay text when the user edits next to or inside them, presses Enter, inserts a variable or markup, makes them bold, or removes a token next to them. A deletion never creates a variable (deleting the `-` of `{na-me}` leaves the text `{name}`).
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

## 12.0.0

### Patch Changes

- Updated dependencies [68eefaf]
- Updated dependencies [56891d6]
- Updated dependencies [5df91b6]
  - @inlang/sdk@3.1.0

## 11.0.6

### Patch Changes

- Updated dependencies [924dd7e]
  - @inlang/sdk@3.0.6

## 11.0.5

### Patch Changes

- Updated dependencies [c73ed13]
- Updated dependencies [59715d2]
  - @inlang/sdk@3.0.5

## 11.0.4

### Patch Changes

- Updated dependencies [c81ef61]
  - @inlang/sdk@3.0.4

## 11.0.3

### Patch Changes

- Updated dependencies [3c1fbc6]
  - @inlang/sdk@3.0.3

## 11.0.2

### Patch Changes

- Updated dependencies [b012f5e]
  - @inlang/sdk@3.0.2

## 11.0.1

### Patch Changes

- Updated dependencies [78ad386]
  - @inlang/sdk@3.0.1

## 11.0.0

### Patch Changes

- Updated dependencies [fb46551]
- Updated dependencies [aaf4e05]
- Updated dependencies [5d7b021]
- Updated dependencies [7ea66f8]
  - @inlang/sdk@3.0.0

## 10.0.3

### Patch Changes

- d17dca4: Keep editor row controls stable when RTL direction is applied while preserving automatic text direction in pattern inputs.

## 10.0.2

### Patch Changes

- Updated dependencies [eccea01]
  - @inlang/sdk@2.10.2

## 10.0.1

### Patch Changes

- Updated dependencies [bf2af52]
  - @inlang/sdk@2.10.1

## 10.0.0

### Patch Changes

- Updated dependencies [6680ac1]
  - @inlang/sdk@2.10.0

## 9.0.3

### Patch Changes

- Updated dependencies [a853d5f]
  - @inlang/sdk@2.9.3

## 9.0.2

### Patch Changes

- Updated dependencies [b292999]
  - @inlang/sdk@2.9.2

## 9.0.1

### Patch Changes

- Updated dependencies [bcd4335]
  - @inlang/sdk@2.9.1

## 9.0.0

### Patch Changes

- Updated dependencies [f1dfc25]
  - @inlang/sdk@2.9.0

## 8.0.0

### Patch Changes

- Updated dependencies [6e6ee7f]
  - @inlang/sdk@2.8.0

## 7.0.0

### Patch Changes

- Updated dependencies [6defee0]
  - @inlang/sdk@2.7.0

## 6.0.2

### Patch Changes

- Updated dependencies [9553df6]
  - @inlang/sdk@2.6.2

## 6.0.1

### Patch Changes

- Updated dependencies [c6708ee]
  - @inlang/sdk@2.6.1

## 6.0.0

### Patch Changes

- Updated dependencies [c1d8e5a]
  - @inlang/sdk@2.6.0

## 5.0.0

### Patch Changes

- Updated dependencies [e9d7a74]
- Updated dependencies [65c33c2]
- Updated dependencies [9d73b90]
- Updated dependencies [2e8318b]
- Updated dependencies [323295a]
  - @inlang/sdk@2.5.0

## 4.0.10

### Patch Changes

- Updated dependencies [22089a2]
  - @inlang/sdk@2.4.9

## 4.0.9

### Patch Changes

- Updated dependencies [56acb22]
  - @inlang/sdk@2.4.8

## 4.0.8

### Patch Changes

- 0dbca1e: Sherlock v2 bugfixes & improvements

## 4.0.7

### Patch Changes

- Updated dependencies [bd2c366]
  - @inlang/sdk@2.4.7

## 4.0.6

### Patch Changes

- Updated dependencies [49a7880]
  - @inlang/sdk@2.4.6

## 4.0.5

### Patch Changes

- Updated dependencies [083ff1f]
  - @inlang/sdk@2.4.5

## 4.0.4

### Patch Changes

- @inlang/sdk@2.4.4

## 4.0.3

### Patch Changes

- @inlang/sdk@2.4.3

## 4.0.2

### Patch Changes

- @inlang/sdk@2.4.2

## 4.0.1

### Patch Changes

- Updated dependencies [5a991cd]
  - @inlang/sdk@2.4.1

## 4.0.0

### Minor Changes

- f01927c: bugfixing

### Patch Changes

- Updated dependencies [f01927c]
  - @inlang/sdk@2.4.0

## 3.0.0

### Patch Changes

- Updated dependencies [c0b857a]
- Updated dependencies [91ba4eb]
  - @inlang/sdk@2.3.0

## 2.0.2

### Patch Changes

- Updated dependencies [c53b1a9]
  - @inlang/sdk@2.2.2

## 2.0.1

### Patch Changes

- Updated dependencies [f51736f]
- Updated dependencies [adf7d6c]
  - @inlang/sdk@2.2.1

## 2.0.0

### Patch Changes

- Updated dependencies [fc41e71]
  - @inlang/sdk@2.2.0

## 1.0.3

### Patch Changes

- @inlang/sdk@2.1.3

## 1.0.2

### Patch Changes

- Updated dependencies [61b9782]
  - @inlang/sdk@2.1.2

## 1.0.1

### Patch Changes

- @inlang/sdk@2.1.1

## 1.0.0

### Patch Changes

- Updated dependencies [8af8ba9]
- Updated dependencies [57f9e7f]
- Updated dependencies [4444034]
- Updated dependencies [fa94c1f]
  - @inlang/sdk@2.1.0

## 0.0.2

### Patch Changes

- @inlang/sdk@2.0.0

## 0.1.21

### Patch Changes

- @inlang/sdk@0.36.3

## 0.1.20

### Patch Changes

- Updated dependencies [2fc5feb]
  - @inlang/sdk@0.36.2

## 0.1.19

### Patch Changes

- Updated dependencies [1077e06]
  - @inlang/sdk@0.36.1

## 0.1.18

### Patch Changes

- Updated dependencies [8ec7b34]
- Updated dependencies [05f9282]
  - @inlang/sdk@0.36.0

## 0.1.17

### Patch Changes

- Updated dependencies [8e9fc0f]
  - @inlang/sdk@0.35.9

## 0.1.16

### Patch Changes

- Updated dependencies [da7c207]
  - @inlang/sdk@0.35.8

## 0.1.15

### Patch Changes

- Updated dependencies [2a5645c]
  - @inlang/sdk@0.35.7

## 0.1.14

### Patch Changes

- Updated dependencies [9d2aa1a]
  - @inlang/sdk@0.35.6

## 0.1.13

### Patch Changes

- Updated dependencies [64e30ee]
  - @inlang/sdk@0.35.5

## 0.1.12

### Patch Changes

- @inlang/sdk@0.35.4

## 0.1.11

### Patch Changes

- @inlang/sdk@0.35.3

## 0.1.10

### Patch Changes

- @inlang/sdk@0.35.2

## 0.1.9

### Patch Changes

- @inlang/sdk@0.35.1

## 0.1.8

### Patch Changes

- Updated dependencies [ae47203]
  - @inlang/sdk@0.35.0

## 0.1.7

### Patch Changes

- Updated dependencies [d27a983]
- Updated dependencies [a27b7a4]
  - @inlang/sdk@0.34.10

## 0.1.6

### Patch Changes

- Updated dependencies [a958d91]
  - @inlang/sdk@0.34.9

## 0.1.5

### Patch Changes

- Updated dependencies [10dbd02]
  - @inlang/sdk@0.34.8

## 0.1.4

### Patch Changes

- Updated dependencies [5209b81]
  - @inlang/sdk@0.34.7

## 0.1.3

### Patch Changes

- Updated dependencies [f38536e]
  - @inlang/sdk@0.34.6

## 0.1.2

### Patch Changes

- Updated dependencies [b9eccb7]
  - @inlang/sdk@0.34.5

## 0.1.1

### Patch Changes

- Updated dependencies [2a90116]
  - @inlang/sdk@0.34.4

## 0.1.0

### Minor Changes

- e4582a1: Initial package
