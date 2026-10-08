# @inlang/editor-component

Web components (Lit) and helpers used by inlang apps to render the editing interface for messages.

### Docs

To open the docs please execute this on the root of the project.

```bash
pnpm --filter @inlang/editor-component run storybook
```

## Composable components and helpers (v13)

Everything below is exported from the package root. Importing a component registers its custom element. Types come from `@inlang/sdk` (`Bundle`, `Message`, `Variant`, `Declaration`, `Pattern`).

```ts
import {
	InlangPatternView,
	InlangPatternEditor,
	InlangMessageForms,
	InlangMessagePreview,
	pluralExamples,
	requiredForms,
	selectVariant,
	formatPattern,
	formatMessage,
	messageIssues,
} from "@inlang/editor-component";
```

### Theming

Components inherit the font of the page and use a neutral zinc palette. Override any of these custom properties on an ancestor:

| Property | Default | Used for |
| --- | --- | --- |
| `--inlang-text` / `--inlang-text-muted` / `--inlang-text-subtle` | `#18181b` / `#52525b` / `#71717a` | text |
| `--inlang-border` / `--inlang-border-strong` | `#e4e4e7` / `#d4d4d8` | borders |
| `--inlang-surface` / `--inlang-surface-muted` / `--inlang-hover` | `#fff` / `#fafafa` / `#f4f4f5` | backgrounds |
| `--inlang-accent` / `--inlang-accent-soft` | `#2563eb` / `#eff6ff` | selection, focus |
| `--inlang-variable-color` / `--inlang-variable-background` | `#1d4ed8` / transparent (editor: `#eff6ff`) | `{variable}` tokens |
| `--inlang-markup-color` / `--inlang-markup-background` | `#52525b` / `#f4f4f5` | unknown markup tags |
| `--inlang-warning` | `#b45309` | "+ Add form" |
| `--inlang-font-mono` | JetBrains Mono, ui-monospace | tokens |

### `<inlang-pattern-view>`

Read-only rendering of a pattern. Expressions are atomic `{name}` tokens (tooltip: `count · plural`). `b`/`strong`/`bold` render bold, `i`/`em`/`italic` italic, `a`/`link`/`u` underlined; unknown markup shows as small tag markers.

| Property | Type | |
| --- | --- | --- |
| `pattern` | `Pattern` | the pattern to render |
| `declarations` | `Declaration[]` (optional) | describes tokens (`count · plural`) |
| `placeholder` | `string` | shown for an empty pattern |

CSS parts: `variable`, `markup`, `placeholder`.

```html
<inlang-pattern-view .pattern=${variant.pattern} .declarations=${bundle.declarations}></inlang-pattern-view>
```

### `<inlang-pattern-editor>`

Lexical-based editor for a variant's pattern (light DOM). Expressions and markup are atomic tokens: they cannot be partially edited, Backspace/Delete removes the whole token, and typing `{name}` creates an expression token. Text between known markup is shown formatted. Existing usage keeps working.

| Property / attribute | Type | |
| --- | --- | --- |
| `variant` | `Variant` | the variant to edit |
| `declarations` | `Declaration[]` (optional) | token tooltips |
| `placeholder` | `string` | default `"Enter pattern ..."` |
| `aria-label` | `string` | accessible name of the text box |

Methods: `insertExpression(name: string)` inserts `{name}` at the caret (or at the end) and focuses the editor; `focus()`.
Events: `change` (`ChangeEventDetail` with the updated variant), `pattern-editor-focus`, `pattern-editor-blur`.
Styling: all styles are scoped to the element. Custom properties: `--inlang-pattern-padding` (`14px 12px`), `--inlang-pattern-min-height` (`44px`), `--inlang-pattern-background` (`#fff`), `--inlang-pattern-hover-background`, `--inlang-pattern-font-size` (`14px`), `--inlang-pattern-line-height`, `--inlang-pattern-color`, `--inlang-pattern-focus-ring`.

```html
<inlang-pattern-editor
	.variant=${variant}
	placeholder="Translate to Russian"
	aria-label="Russian translation"
	@change=${(e) => save(e.detail.newData)}
></inlang-pattern-editor>
```

### `<inlang-message-forms>`

Compact overview of a message's variants for picking one. One selector: a list (match, plural example numbers, pattern). Two selectors: a grid (rows: first selector incl. "any other" for `*`, columns: second selector with plural examples). Three or more: segmented tabs for each leading selector plus a grid for the last two. Required forms (see `requiredForms`) without a variant are "+ Add form" buttons. Scrolls horizontally with a sticky first column.

| Property | Type | |
| --- | --- | --- |
| `message` | `Message` (or nested message with `variants`) | |
| `variants` | `Variant[]` | defaults to `message.variants` |
| `declarations` | `Declaration[]` | |
| `locale` | `string` | defaults to `message.locale` |
| `selectedVariantId` | `string` | outlined, `aria-pressed="true"` |
| `caption` | `string` | defaults to "Russian uses 4 plural forms. The numbers are examples."; `""` hides it; or use `slot="caption"` |

Events: `select-variant` (`{ variantId }`), `add-variant` (`{ matches }`, in selector order, ready for a new `Variant`).

```html
<inlang-message-forms
	.message=${message}
	.variants=${message.variants}
	.declarations=${bundle.declarations}
	.selectedVariantId=${selectedId}
	@select-variant=${(e) => (selectedId = e.detail.variantId)}
	@add-variant=${(e) => addVariant(message, e.detail.matches)}
></inlang-message-forms>
```

### `<inlang-message-preview>`

Inputs for the bundle's input variables (number for plural/number functions, date for datetime, a select for selectors with the keys used by the variants plus "other", text otherwise) and the formatted result with real bold/italic, plus the form that was used.

| Property | Type | |
| --- | --- | --- |
| `declarations` | `Declaration[]` | |
| `message`, `variants`, `locale` | | as above |
| `values` | `Record<string, unknown>` (optional) | initial/controlled values; defaults: number `3`, today, first select key, the variable name |
| `reference` | `{ message, variants, locale }` (optional) | also shows the reference output |
| `heading` | `string` | default `"Preview"`, `""` hides it |

Events: `values-change` (`{ values }`), `variant-match` (`{ variantId }`, also fired initially).

```html
<inlang-message-preview
	.declarations=${bundle.declarations}
	.message=${ru}
	.variants=${ru.variants}
	.values=${{ actorName: "Anna", count: 3 }}
	.reference=${{ message: en, variants: en.variants, locale: "en" }}
	@variant-match=${(e) => (selectedId = e.detail.variantId)}
></inlang-message-preview>
```

### Helpers

```ts
pluralExamples("ru");
// { one: "1, 21, 31…", few: "2–4, 22…", many: "0, 5–20…", other: "1.5" }
pluralExamples("en", "ordinal"); // { one: "1, 21, 31…", two: "2, 22, 32…", … }

// Every match combination a message should have in a locale (plural selectors:
// Intl categories; other selectors: literal keys used in the variants plus "*").
requiredForms(message, bundle.declarations, "ru", message.variants);
// [[{ type: "literal-match", key: "countPlural", value: "one" }], …]

// The variant MessageFormat 2 would pick (exact numeric keys beat categories,
// literal keys beat catch-all, first selector most significant).
selectVariant({ message, variants, declarations, values: { count: 3 }, locale: "ru" });

formatPattern({ pattern, declarations, values: { name: "Anna", count: 3 }, locale: "ru" });
// [{ type: "markup-start", name: "b" }, { type: "text", value: "Anna" }, { type: "markup-end", name: "b" }, …]
formatMessage({ message, variants, declarations, values, locale: "en" }); // "Anna sent you 3 files"

messageIssues({
	reference: { message: en, variants: en.variants },
	target: { message: ru, variants: ru.variants },
	declarations: bundle.declarations,
	locale: "ru",
});
// [{ type: "missing-variable", name: "total" }, { type: "missing-form", matches: [...] }]
```

`messageIssues` returns, in this order: `missing-translation` (target missing or all patterns empty; nothing else is reported then), `missing-variable` (a reference variable absent from any non-empty target variant; variables used only as selectors are ignored; variants that match an exact number such as `"0"` on a plural selector are exempt), `extra-variable`, `missing-markup`, and `missing-form` (a required form without an exactly matching variant — a catch-all does not cover a plural category the locale has).

Also exported: `selectorKeys`, `formatPatternToString`, `variableNames`, `markupNames`, `previewInputs`, `languageName`, `selectorMatches`, `patternToString`, `stringToPattern`, `createChangeEvent`.
