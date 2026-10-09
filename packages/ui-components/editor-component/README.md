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
	selectVariant,
	formatPattern,
	formatMessage,
	addSelector,
	addExactNumber,
	addSelectValue,
} from "@inlang/editor-component";
```

**Translation rules live in `@inlang/sdk`.** Which forms a locale needs, which selectors are one choice and what counts as a problem (missing variables, unknown variables, missing markup, missing forms) come from the SDK's checks — `checkBundle` / `checkTranslation` for problems, `selectorGroups` / `requiredVariants` / `missingVariants` for forms. `<inlang-message-forms>` uses them too, so its "+ Add form" buttons are exactly the SDK's `missing-variant` diagnostics. The component only presents them and transforms bundles. `@inlang/sdk` is a peer dependency; the component imports the rules from `@inlang/sdk/browser`.

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
| `--inlang-forms-label-width` / `--inlang-forms-column-min-width` | `96px` / `120px` | label column and min. width of the other columns of the `<inlang-message-forms>` grid |
| `--inlang-link-color` | `#1d4ed8` | underline of links in `<inlang-pattern-editor>` |
| `--inlang-toolbar-background` / `--inlang-toolbar-color` | `#18181b` / `#fff` | selection toolbar of `<inlang-pattern-editor>` |
| `--inlang-search-highlight` | `#fde68a` | text ranges a host registers as the `inlang-search` [CSS custom highlight](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) in `<inlang-pattern-view>` (the text is in its open shadow root) |
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
| `markupOptions` | `Array<{ part: MarkupStart; label: string }>` | markup a selection can be wrapped in, usually the reference's (`{ part: <link href=…>, label: "Link like “docs”" }`). Selecting text shows a toolbar with these labels; ⌘K / ⌘B / ⌘I wrap the selection in the link / bold / italic option, and inside such markup the toolbar and the same shortcut remove it again |
| `variables` | `Array<{ name: string; hint?: string }>` | suggested after typing `{`, in this order (e.g. the reference's variables missing in the translation first); ↑/↓ choose, Enter or Tab insert, Escape types a plain `{` |

Methods:

- `insertExpression(name: string)` inserts `{name}` at the caret (or at the end) and focuses the editor.
- `wrapSelection(start: MarkupStart, placeholder?: string): boolean` wraps the selection in `start` and its closing tag; without a selection it inserts the markup around `placeholder` and selects that. Returns false when nothing was wrapped.
- `unwrapMarkup(name: string): boolean` removes the markup `name` around the caret and keeps its words (unlinks a link). Returns false when there is none.
- `insertMarkup(part: MarkupStandalone)` inserts a standalone tag (a line break, an icon) at the caret or at the end.
- `forgetEdits()` makes the next `variant` replace the content even if it equals text typed earlier, e.g. after the host undid an edit (see Undo).
- `focus()` focuses the editable area, also right after the editor was created or got a new `variant`.

Events: `change` (`ChangeEventDetail` with the updated variant), `pattern-editor-focus`, `pattern-editor-blur`.

Saving asynchronously is fine: the editor remembers what it emitted and ignores those patterns when the host passes them back while the user keeps typing (compared structurally, so a store may reorder keys). A pattern it did not emit replaces the content, and a `variant` with another `id` always does. Deleting one tag of a markup pair removes its partner and keeps the words; markup that has no partner to begin with (a lone `markup-start` is valid MessageFormat 2) is kept.

**Undo is owned by the host.** The editor has no undo history of its own (⌘Z does nothing in it), so it never fights an app-level undo such as Figma's or a store's. To undo, the host restores the previous pattern, calls `forgetEdits()` and passes the variant again.
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

Compact overview of a message's variants for picking one. One selector: a list (match, plural example numbers, pattern). Two selectors: a grid (rows: first selector incl. "any other" for `*`, columns: second selector with plural examples). Three or more: segmented tabs for each leading selector plus a grid for the last two. Forms the locale needs without a variant (`missingVariants` of `@inlang/sdk`, the same rule as the `missing-variant` check) are "+ Add form" buttons; other empty combinations are a quiet "+ Add". Scrolls horizontally with a sticky first column.

A plural's explicit `other` key (the shape Paraglide imports) is its catch-all: it is shown once as "other". Example numbers are shifted by an ICU `offset`.

An exact number next to a plural category of the same input — what `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}`: an un-annotated selector (`countPluralExact`) plus a `:plural` selector (`countPlural`), both reading `count` — is shown as **one** choice (`0 exactly`, `one`, `other`) and a form never needs a number *and* a category (see `selectorGroups` of `@inlang/sdk`). The data is not changed.

| Property | Type | |
| --- | --- | --- |
| `message` | `Message` (or nested message with `variants`) | |
| `variants` | `Variant[]` | defaults to `message.variants` |
| `declarations` | `Declaration[]` | |
| `locale` | `string` | defaults to `message.locale` |
| `referenceVariants` | `Variant[]` (property only) | variants of the reference language: their select values (female / male) and exact numbers (`=0`) are needed here too, as in the SDK's checks |
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
pluralExamples("en", "cardinal", { exclude: [0] }); // { one: "1", other: "2, 3, 4…" }: 0 has its own form
pluralExamples("en", "cardinal", { offset: 1 }); // ICU offset: { one: "2", other: "1, 3, 4…" }

// The variant MessageFormat 2 would pick (exact numeric keys beat categories,
// literal keys beat catch-all, first selector most significant; an ICU offset
// shifts the number for the category, not for exact numbers).
selectVariant({ message, variants, declarations, values: { count: 3 }, locale: "ru" });

// Make a message plural / ordinal / a select in every language (pure, returns a new bundle).
// `bundle` is a nested bundle: { declarations, messages: [{ id, selectors, variants }] }.
const plural = addSelector(bundle, { variable: "count", kind: "plural" });
// declares `.local $countPlural = {$count :plural}`, adds the selector to every message and a catch-all
// match to every existing variant (the text stays as the "other" form); the SDK's missingVariants /
// <inlang-message-forms> then offer "+ Add form" for the categories of each language.
addSelector(bundle, { variable: "gender", kind: "select", values: ["female", "male"], locale: "en" }); // + empty forms in "en", before the catch-all
selectableVariables(bundle); // ["count", "gender"]: declared variables whose input is no selector yet ("count" is gone once `countPlural` is)
// addSelector throws for an input that already is a plural: add exact numbers with addExactNumber instead
removeSelector(plural, "countPlural"); // keeps the catch-all ("other") form per language (`{ keep: "one" }` to keep another), drops the rest and the local variable;
// a plural's exact-number selector (`countPluralExact`, ICU `=0`) is removed with it (`{ keep: "0" }` keeps that form)

// Exact numbers (ICU `=0`) of a plural. The first one declares `.local $countPluralExact = {$count}`
// (what @inlang/plugin-icu1 imports and exports) and puts it before `countPlural` in every message; the
// message of `locale` (the reference) gets an empty "0" form per row. Other languages get no form: the SDK
// requires it there ("+ Add form", `missing-variant`), so an untranslated =0 is absent from exports.
// An exact-number selector that any language already has (icu1 declares it only where `=0` is used) is reused.
const zero = addExactNumber(plural, { selector: "count", value: 0, locale: "en" }); // or selector: "countPlural"
removeExactNumber(zero, { selector: "count", value: 0 }); // from every language; the last one removes the selector

// One more value of a select (an empty form per row in the message of `locale`), or one less (every language).
addSelectValue(bundle, { selector: "gender", value: "diverse", locale: "en" });
removeSelectValue(bundle, { selector: "gender", value: "male" }); // the selector and its other values stay

formatPattern({ pattern, declarations, values: { name: "Anna", count: 3 }, locale: "ru" });
// [{ type: "markup-start", name: "b" }, { type: "text", value: "Anna" }, { type: "markup-end", name: "b" }, …]
formatMessage({ message, variants, declarations, values, locale: "en" }); // "Anna sent you 3 files"
```

`addSelector`, `removeSelector`, `addExactNumber`, `removeExactNumber`, `addSelectValue` and `removeSelectValue` are pure: they return a new bundle and accept `BundleNested` (`messageId`) as well as database rows (`message_id`); fields they do not know are kept. New forms are created only in the message of `locale` (normally the reference): they copy a variant of their row, get an empty pattern and a new `id` (default uuid v7, `createId` to override) and are put before the row's catch-all, so exports keep "other" last. Other languages never get empty forms: they show "+ Add form" and the `missing-variant` check until a translator adds the form. Removing a value or number removes its forms from every language. They throw for requests that make no sense (a select value on a plural, a word as an exact number, a value that does not exist). Afterwards `missingVariants` / `checkBundle` of `@inlang/sdk` require the new forms in every other language.

Also exported: `formatPatternToString`, `previewInputs`, `languageName`, `selectorMatches`, `patternToString`, `stringToPattern`, `createChangeEvent`.
