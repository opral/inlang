---
"@inlang/editor-component": major
---

Composable editor components for list-style translation UIs.

New components: `<inlang-pattern-view>` (read-only pattern with variable tokens and real bold/italic/underline for markup), `<inlang-message-forms>` (list, grid or tabbed grid of a message's variants with plural example numbers and "+ Add form" buttons for missing required forms; `select-variant` / `add-variant` events) and `<inlang-message-preview>` (inputs derived from the bundle's input variables and the formatted output, optionally next to the reference language; `values-change` / `variant-match` events).

New helpers: `pluralExamples`, `selectVariant`, `formatPattern` / `formatMessage`, `previewInputs`. The translation rules (required forms, missing / unknown variables, missing markup) are not part of the component: `<inlang-message-forms>` uses `selectorGroups` / `missingVariants` of `@inlang/sdk` (imported from `@inlang/sdk/browser`), the same rules as the SDK's `missing-variant` check, and hosts use `checkBundle` / `checkTranslation` for problems. Requires the `@inlang/sdk` release with those exports.

`lit` is now a runtime dependency, and test files are no longer published.

Breaking changes in `<inlang-pattern-editor>`:

- Expressions and markup are atomic tokens (deleted as a whole). Markup is now preserved instead of being dropped from the pattern, and text between known markup is shown formatted.
- Styles no longer leak: the global `div` / `p` selectors were removed and all styles are scoped to the element. Padding, min-height, background, font size and colors are themeable via `--inlang-pattern-*` custom properties (current values are the defaults).
- New `placeholder` and `aria-label` support and an `insertExpression(name)` method. The `variant` property and the `change`, `pattern-editor-focus` and `pattern-editor-blur` events are unchanged.

Theming: besides colors, hosts can now set borders (`--inlang-pattern-border-width/-color/-hover-border-color/-focus-border-color/-border-radius`), popover font size / radius / shadow (`--inlang-popover-*`), the small radius (`--inlang-radius-small`), the four font sizes (`--inlang-font-size-large/-font-size/-font-size-small/-font-size-caption`), `--inlang-control-height`, `--inlang-forms-row-min-height/-padding` and the size and radius of variable tokens (`--inlang-token-font-size/-token-radius`). Defaults are unchanged. `<inlang-pattern-editor>` has a `forgetEdits()` method for hosts that restore earlier text (undo) while echoes of its own edits may still be pending.

Selectors: `addSelector(bundle, { variable, kind: "plural" | "ordinal" | "select", values? })` makes a message plural / ordinal / a select in every language (a catch-all match for existing variants, `<variable>Plural` local variable for plurals, empty forms for the `values` of a select), `removeSelector(bundle, name, { keep? })` takes it away again and `selectableVariables(bundle)` lists the candidates. All pure, usable with `BundleNested` and database rows.

`addExactNumber(bundle, { selector, value })` / `removeExactNumber` add and remove an exact-number form (ICU `=0`) of a plural in every language, in the shape `@inlang/plugin-icu1` imports and exports (a `<plural>Exact` local variable before the plural selector, removed again with the last number). `addSelectValue(bundle, { selector, value })` / `removeSelectValue` add or remove one value of a select in every language without touching the selector. `<inlang-message-forms>` shows an exact number and the plural of the same input as one choice and takes `referenceVariants`: the reference's select values and exact numbers are needed in a translation too.
