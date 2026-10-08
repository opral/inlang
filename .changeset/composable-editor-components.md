---
"@inlang/editor-component": major
---

Composable editor components for list-style translation UIs.

New components: `<inlang-pattern-view>` (read-only pattern with variable tokens and real bold/italic/underline for markup), `<inlang-message-forms>` (list, grid or tabbed grid of a message's variants with plural example numbers and "+ Add form" buttons for missing required forms; `select-variant` / `add-variant` events) and `<inlang-message-preview>` (inputs derived from the bundle's input variables and the formatted output, optionally next to the reference language; `values-change` / `variant-match` events).

New helpers: `pluralExamples`, `requiredForms`, `selectVariant`, `formatPattern` / `formatMessage`, `messageIssues`, `previewInputs`. The catch-all variant MF2 requires is treated as a plural's "other" form, so it is never reported as a separate missing form.

`lit` is now a runtime dependency, and test files are no longer published.

Breaking changes in `<inlang-pattern-editor>`:

- Expressions and markup are atomic tokens (deleted as a whole). Markup is now preserved instead of being dropped from the pattern, and text between known markup is shown formatted.
- Styles no longer leak: the global `div` / `p` selectors were removed and all styles are scoped to the element. Padding, min-height, background, font size and colors are themeable via `--inlang-pattern-*` custom properties (current values are the defaults).
- New `placeholder` and `aria-label` support and an `insertExpression(name)` method. The `variant` property and the `change`, `pattern-editor-focus` and `pattern-editor-blur` events are unchanged.

Theming: besides colors, hosts can now set borders (`--inlang-pattern-border-width/-color/-hover-border-color/-focus-border-color/-border-radius`), popover font size / radius / shadow (`--inlang-popover-*`), the small radius (`--inlang-radius-small`), the four font sizes (`--inlang-font-size-large/-font-size/-font-size-small/-font-size-caption`), `--inlang-control-height`, `--inlang-forms-row-min-height/-padding` and the size and radius of variable tokens (`--inlang-token-font-size/-token-radius`). Defaults are unchanged. `<inlang-pattern-editor>` has a `forgetEdits()` method for hosts that restore earlier text (undo) while echoes of its own edits may still be pending.

Selectors: `addSelector(bundle, { variable, kind: "plural" | "ordinal" | "select", values? })` makes a message plural / ordinal / a select in every language (a catch-all match for existing variants, `<variable>Plural` local variable for plurals, empty forms for the `values` of a select), `removeSelector(bundle, name, { keep? })` takes it away again and `selectableVariables(bundle)` lists the candidates. All pure, usable with `BundleNested` and database rows.

`requiredForms` / `<inlang-message-forms>` / `messageIssues` treat an exact number and a plural category of the same input (what `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}`) as one choice (new helper `selectorGroups`), so the impossible form "0 × one" is not required and the grid shows one list instead of a 2 × 2 grid. New optional `referenceVariants` (property of `<inlang-message-forms>`, last argument of `requiredForms` / `selectorGroups`): literal keys of the reference's select selectors are also required in a translation.
