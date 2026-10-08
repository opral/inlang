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
| `--inlang-radius` / `--inlang-radius-small` | `8px` / `6px` | preview / cards, buttons and inputs |
| `--inlang-font-size-large` / `--inlang-font-size` / `--inlang-font-size-small` / `--inlang-font-size-caption` | `14px` / `13px` / `12px` / `11px` | message preview and message forms text sizes |
| `--inlang-token-font-size` / `--inlang-token-radius` | `0.86em` / `4px` | `{variable}` tokens and unknown-markup markers (editor and view) |
| `--inlang-control-height` | `32px` | min. height of the tabs in `<inlang-message-forms>` |
| `--inlang-forms-row-min-height` / `--inlang-forms-row-padding` | `36px` / `8px 10px` | form rows of `<inlang-message-forms>` |
| `--inlang-popover-font-size` / `--inlang-popover-radius` / `--inlang-popover-shadow` | `13px` / `8px` (toolbar), `10px` (suggestions) / soft shadow | selection toolbar and `{` suggestions of `<inlang-pattern-editor>` |

The pattern editor has its own border and hover/focus properties, see below. Together they are enough to match a host design system (Parrot maps them onto Figma's `--figma-color-*` tokens: 11px type, 1px borders, 5px radius).

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
Styling: all styles are scoped to the element. Custom properties: `--inlang-pattern-padding` (`14px 12px`), `--inlang-pattern-min-height` (`44px`), `--inlang-pattern-background` (`#fff`), `--inlang-pattern-hover-background`, `--inlang-pattern-font-size` (`14px`), `--inlang-pattern-line-height`, `--inlang-pattern-color`, `--inlang-pattern-focus-ring` (a box shadow; `none` removes it), `--inlang-pattern-border-width` (`0`), `--inlang-pattern-border-color` (`transparent`), `--inlang-pattern-hover-border-color` and `--inlang-pattern-focus-border-color` (both default to the border color), `--inlang-pattern-border-radius` (`0`). The border is part of the editable area: its padding and min-height include it, and the placeholder lines up with the text.

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

An exact number next to a plural category of the same input — what `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}`: an un-annotated selector (`countPluralExact`) plus a `:plural` selector (`countPlural`), both reading `count` — is shown as **one** choice (`0 exactly`, `one`, `other`) and a form never needs a number *and* a category (see `selectorGroups`). The data is not changed.

| Property | Type | |
| --- | --- | --- |
| `message` | `Message` (or nested message with `variants`) | |
| `variants` | `Variant[]` | defaults to `message.variants` |
| `declarations` | `Declaration[]` | |
| `locale` | `string` | defaults to `message.locale` |
| `referenceVariants` | `Variant[]` (property only) | variants of the reference language: their literal keys of select selectors (e.g. female / male) are also required here, so a translation without variants yet is asked for the same forms |
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

// Make a message plural / ordinal / a select in every language (pure, returns a new bundle).
// `bundle` is a nested bundle: { declarations, messages: [{ id, selectors, variants }] }.
const plural = addSelector(bundle, { variable: "count", kind: "plural" });
// declares `.local $countPlural = {$count :plural}`, adds the selector to every message and a catch-all
// match to every existing variant (the text stays as the "other" form); requiredForms / <inlang-message-forms>
// then offer "+ Add form" for the categories of each language.
addSelector(bundle, { variable: "gender", kind: "select", values: ["female", "male"] }); // + empty forms
selectableVariables(bundle); // ["count", "gender"]: declared variables that are no selector yet
removeSelector(plural, "countPlural"); // keeps the catch-all ("other") form per language (`{ keep: "one" }` to keep another), drops the rest and the local variable

// The selectors of a message as the choices a translator sees (an exact number + plural of one input are one group).
selectorGroups(message, bundle.declarations, "en", message.variants);
// [{ names: ["countPlural"], input: "count", plural, keys: ["one", "*"], requiredKeys: ["one", "*"], values(key), keyOf(variant) }]

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

`requiredForms(message, declarations, locale, variants, referenceVariants?)` never requires an exact number together with a plural category of the same input (the form "0 × one" of an imported ICU `=0 {…} one {…}` can never be chosen). `addSelector` / `removeSelector` accept `BundleNested` (`messageId`) as well as database rows (`message_id`): fields they do not know are kept. New variants copy an existing variant of the message and only get a new `id` (default uuid v7, `createId` to override).

Also exported: `selectorGroups`, `selectorKeys`, `formatPatternToString`, `variableNames`, `markupNames`, `previewInputs`, `languageName`, `selectorMatches`, `patternToString`, `stringToPattern`, `createChangeEvent`.
