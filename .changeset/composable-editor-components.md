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
