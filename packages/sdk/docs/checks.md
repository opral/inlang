# Project checks and fixes

Translation projects accumulate missing translations and messages whose application usages have been removed. Inlang provides the same checks to editors, scripts and CI through `checkProject`. Checks produce derived results; they do not mutate the project, start subscriptions or read application files.

## Check translations

```ts
import { checkProject } from "@inlang/sdk";

const result = await checkProject({ project });
```

`missing-translation` reports a bundle that has no message row for a configured locale, including the base locale. It reads IDs and locales only.

The translation checks compare every locale's message with the reference locale's message (`settings.baseLocale`, or `referenceLocale`):

| Check               | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Extra fields                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `empty-translation` | A message whose every variant has no text, variables or markup, the reference locale's included. Applications usually treat it like a missing translation.                                                                                                                                                                                                                                                                                                                                                                                                                                                | `messageId`                                           |
| `empty-variant`     | One variant (form) has no text, variables or markup while another variant of the message has, e.g. an ICU `=0 {}`, the reference locale's included. Editors can show it next to the form.                                                                                                                                                                                                                                                                                                                                                                                                                 | `messageId`, `variantId`, `matches`                   |
| `missing-variable`  | A variable of the reference forms with the same exact numbers and select values is absent from a non-empty variant (plural categories aren't compared by name: they mean different numbers per locale); when the reference has no such form, any reference variable counts. A plural's input is needed in every form of the plural, except a form for one exact number (`0`, or a category that selects a single number such as German `one`), which may spell that number out; other variables stay required. Variables used only as selectors are not required. Not checked against an empty reference. | `messageId`, `variantId`, `name`                      |
| `unknown-variable`  | A variant uses a variable no reference pattern uses, e.g. a typo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `messageId`, `variantId`, `name`, `suggestion?`       |
| `missing-markup`    | A markup tag the reference uses (`<link>`, `<b>`, `<br/>`) is absent from a non-empty variant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `messageId`, `variantId`, `name`                      |
| `missing-variant`   | A match combination the locale needs has no variant: a plural category of the locale (Russian needs one, few, many and the catch-all as other; categories only millions select, such as French or Spanish `many`, are not required), or a select value or exact number (ICU `=0`) a variant of the locale or of the reference uses. A number on the plural selector itself (`countPlural=0`) never matches at runtime and doesn't cover an exact number.                                                                                                                                                  | `messageId`, `matches`                                |
| `missing-selector`  | The reference chooses by an input and the translation can't: no selector for a select's values, no plural the locale needs more than one form of (a Russian single text or exact numbers only for an English plural; not Japanese), or no exact-number selector for the reference's exact numbers (a plural alone can't express `=0`). Editors offer to split the translation by that input or add the exact number.                                                                                                                                                                                      | `messageId`, `name` (the input), `selector`, `values` |

Selectors belong to each locale's message, so one locale can split by a plural while another uses one text; coverage is checked against the locale's own selectors, the reference locale's included. The reference itself is only checked for empty translations and variants and missing variants. Plural rules come from `Intl.PluralRules` (locales such as `pt_BR` are read as `pt-BR`) for `:plural` and follow local-variable aliases. `:number` and `:integer` select by value, like Paraglide's runtime (which formats the number): `count=1` matches, a category such as `one` never does; plurals whose type or options are only known at runtime, and unsupported locales, require only the catch-all. A literal ICU `offset` keeps the rules known (`pluralRules()` reports it as `offset`). An exact number next to a plural of the same input — what `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}`: `.local $countPluralExact = {$count}` next to `.local $countPlural = {$count :plural}` — is one choice: the locale needs `0`, its categories and the catch-all, never "0 and one", and the `0` form may spell the number out. The same comparison is exported as `checkTranslation()` for editors that check unsaved input.

### Selector rules for editors

Editors that show a message's forms use the same rules as the checks, so an "add form" button and a `missing-variant` diagnostic never disagree:

```ts
import { selectorGroups, requiredVariants, missingVariants } from "@inlang/sdk";

const options = { referenceVariants: referenceMessage.variants };
selectorGroups(message, bundle.declarations, options);
// [{ names: ["countPluralExact", "countPlural"], selector: "countPlural", exactSelector: "countPluralExact",
//    input: "count", isPlural: true, plural: { type: "cardinal", categories: ["one", "other"] },
//    keys: ["0", "one", "*"], requiredKeys: ["0", "one", "*"], values(key), keyOf(variant) }]
requiredVariants(message, bundle.declarations, options); // every form the locale needs (Match[][])
missingVariants(message, bundle.declarations, options); // the ones no variant covers = `missing-variant`
```

`selectorGroups` lists what a translator sees as one choice each: usually one selector, or an exact-number selector with its plural. `keys` are in display order (exact numbers, categories, other literal keys, `*` last), `requiredKeys` what the locale needs, `values(key)` the match value per selector and `keyOf(variant)` the key of a variant. Also exported: `variantCovers`, `pluralRules` (categories, single-number categories and `Intl.PluralRules` of a selector), `pluralCategories`, `isSingleNumberCategory`, `isPluralSelector`, `resolveAnnotation` and `resolveInputVariable` (both follow `.local` aliases), `matchValue`, `isNumericKey`.

The translation checks read patterns. Select checks to skip them when only IDs matter:

```ts
const result = await checkProject({
	project,
	checks: ["missing-translation", "unused-message"],
});
```

Syntax and parsing/import errors remain separate.

Intentional fallback can exempt individual bundle/locale combinations:

```ts
const result = await checkProject({
	project,
	ignoreMissingTranslations: [{ bundleId: "brand_name", locale: "de" }],
});
```

These exclusions also cover `empty-translation`, not `empty-variant`: a fallback is a missing or empty message, not a message with one empty form. They are supplied by the caller; the SDK does not persist them or change fallback behavior.

### Check bundles in memory

Editors that keep bundles in memory can check one bundle synchronously, without a project or database round trip, whenever it changes:

```ts
import { checkBundle } from "@inlang/sdk";

const diagnostics = checkBundle({
	bundle, // nested rows or the camelCase shapes plugins use
	locales: settings.locales,
	referenceLocale: settings.baseLocale,
});
```

`checkBundle` reports the same diagnostics as `checkProject` for that bundle, except `unused-message`, ordered by locale (reference first). It accepts `checks` and `ignoreMissingTranslations` (locales of this bundle). Keep the results per bundle and replace them when the bundle changes; a settings change requires checking every bundle again.

## Check application usage

Provide a complete snapshot of the application source files in the scope you want to analyze:

```ts
const result = await checkProject({
	project,
	files: [
		{
			path: "src/Welcome.tsx",
			content: `
        import { m } from '@/generated/paraglide/messages';
        export const Welcome = () => <h1>{m.welcome()}</h1>;
      `,
		},
	],
});
```

The SDK discovers `analyzeUsage` from the project's loaded plugins. For Paraglide, install the new version of `@inlang/plugin-m-function-matcher` containing this capability. Older matcher versions continue to work for IDE features, but cannot establish unused messages. No separate analyzer argument is needed.

The caller owns file collection, exclusions and source revision tracking. Include all relevant application usages; exclude generated message implementations, dependencies and build output. `files` always represents a full snapshot, **not just changed files**. An omitted or empty snapshot makes usage checking unavailable.

“Unused” means no usage found within the supplied source snapshot. It does not establish absence of references in other repositories, external consumers, designs or code omitted by the caller.

### Supported m-function usage

The m-function matcher analyzes ESM JavaScript, JSX, TypeScript, TSX and Svelte (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.mts` and `.svelte`). CommonJS and dynamically evaluated code (`eval`/`Function`) are unsupported: `.cjs`/`.cts` files, `require()` and TypeScript CommonJS imports/exports make analysis incomplete.

Known evaluator/loader references, indirect function-constructor access, and dynamic access to or escapes of global objects (`globalThis`, `window`, `self`, `global`, `parent`, `top`, `frames`, `opener`) also make analysis incomplete. These guards are conservative: passing a global object as a value or reading a non-message object’s `constructor` can withhold findings even when the application does not evaluate code. Possible global-object member aliases (such as `window`, `parent`, `top`, `contentWindow` and `defaultView`) also withhold findings. Timer references (`setTimeout`/`setInterval`) require inline function handlers: string handlers, aliases and handlers whose type is unresolved make analysis incomplete. Ordinary static global members and `typeof window` remain supported. Module loaders that take computed names make analysis incomplete too: `import.meta.glob`/`globEager` and any other `import.meta` property except `env`, `url`, `dirname`, `filename` and `hot` (also `import.meta` as a value), webpack's `require.context` and `__webpack_require__`, and `Reflect` lookups on a message namespace or global object.

JSX is parsed in `.js`, `.jsx`, `.mjs` and `.tsx` files, not in `.ts`/`.mts` (where `<string>value` is a type assertion). Decorators parse in both the TypeScript experimental form (Angular, Nest, Lit) and the standard form. `typeof m.welcome` and `typeof m["welcome"]` in a type count as usages. `import.meta.hot.accept` with dependencies makes analysis incomplete (its callback receives those modules); accepting itself does not.

It retains static reads and function references, not just calls:

```ts
m.welcome();
m["welcome"]();
m[`welcome`]();
const label = m.welcome;

import { m as translations } from "./messages.js";
translations.welcome();

import * as translations from "./custom-generated-path";
translations.welcome();

// Paraglide's messages.js re-exports the namespace as `m`
import * as all from "./paraglide/messages.js";
all.m.welcome();
```

Named function imports are retained conservatively, even from custom paths and even if the imported function is never called. Shadowed names and unrelated namespace imports can also retain messages. This trades detection precision for avoiding deletion of a possible usage.

Dynamic access and message namespace escapes make analysis incomplete:

```ts
m[`${fieldName}_label`]();
m[message]();
const alias = m;
renderLabel(m);
```

Svelte files use the Svelte compiler parser. Both instance and module scripts (JavaScript or TypeScript), template expressions, blocks, snippets, component references and directives are analyzed. Dynamic references, external scripts, unsupported script languages and parse failures make analysis incomplete. No Svelte-specific configuration is needed: include `.svelte` files in the same complete source snapshot.

This release does not implement TypeScript data-flow analysis or resolve all module graphs. Reexports with a source module, TypeScript import assignments, and all dynamic/CommonJS imports are incomplete. Vue and Astro files are unsupported and make the snapshot incomplete. Do not omit relevant unsupported files to obtain a complete result.

The matcher also reports incomplete analysis for parse errors, a file over two million characters, or a snapshot over 10,000 files or 50 million characters. It does not silently skip these files.

## Find usages

`findUsages` returns where messages are used in the same snapshot, for code previews, "find references" and links to the source. It shares the analysis cache with `checkProject`:

```ts
import { findUsages } from "@inlang/sdk";

const { status, references } = await findUsages({
	project,
	files,
	bundleIds: ["welcome"],
});
// [{ bundleId: "welcome", path: "src/Welcome.tsx", start: { line: 2, column: 40 }, end: { line: 2, column: 52 } }]
```

Lines are 1-based, columns 0-based and `end` is exclusive; a called reference covers the whole call. References are only as complete as the analysis: with an `incomplete` status, a message without references may still be used.

## Read results

```ts
{
  diagnostics: [
    {
      checkId: "missing-translation",
      bundleId: "welcome",
      locale: "de",
      severity: "warning",
      message: 'Message "welcome" has no translation for "de".',
      fixes: [],
    },
  ],
  checks: [
    { id: "missing-translation", status: "complete" },
    {
      id: "unused-message",
      status: "unavailable",
      reason: "Source files were not provided.",
    },
  ],
}
```

Each check has a status:

- `complete`: the check finished for its supplied inputs.
- `incomplete`: analysis encountered unresolved usage, unsupported input, plugin errors or failures. Source issues include a path when available.
- `unavailable`: source files or a capable plugin are absent.

Incomplete usage analysis withholds **all unused-message diagnostics and deletion fixes**. Missing-translation checks still run. A mixture of a capable plugin and a legacy matcher without usage analysis is incomplete.

Results, including fix metadata, are JSON serializable. An empty diagnostics array alone does not mean all checks completed. Applications decide which warnings or incomplete checks should fail CI.

## Apply a fix

An unused diagnostic includes a fix:

```ts
{
  checkId: "unused-message",
  bundleId: "old_welcome",
  severity: "warning",
  message: 'Message "old_welcome" has no detected usage in the supplied source snapshot.',
  fixes: [{
    id: "delete-unused-message",
    title: "Delete message from all locales",
    expectedRevision: "...", // opaque; retain unchanged
  }],
}
```

Apply an explicitly selected fix using a current full source snapshot:

```ts
import { applyFix } from "@inlang/sdk";

const diagnostic = result.diagnostics.find(
	(item) => item.checkId === "unused-message"
);

if (diagnostic) {
	const outcome = await applyFix({
		project,
		files,
		diagnostic,
		fixId: "delete-unused-message",
	});

	if (outcome.status === "applied") {
		// Refresh these bundles in your UI or re-run checks.
		console.log(outcome.affectedBundleIds);
	} else {
		console.log(outcome.reason);
	}
}
```

`applyFix` reruns usage analysis rather than trusting a cached finding. It verifies settings and the bundle's revision, including every message and variant, inside the deletion transaction. Changed or deleted targets, new usages, unavailable analysis and unoffered fixes are skipped. An applied fix deletes the bundle, all locale messages and all variants atomically. Database failures or concurrent transaction conflicts reject the promise; partial deletion is rolled back.

The source snapshot is caller-owned and cannot be atomically locked with the project database. Applications must keep it current and coordinate source edits when applying fixes. Rechecking the supplied snapshot does not re-read the filesystem or GitHub.

This release offers deletion only. Missing translations have no automatic fix until a translation provider is available; copying the base-locale text is not treated as translation. `applyFix` changes the local project only. Saving, exporting, publishing and UI confirmation remain application concerns. There is no new CLI command in this release.

## Real-time editors and scalability

Both APIs are exported from `@inlang/sdk` and `@inlang/sdk/browser`.

Editors run checks on open and after changes. For a translation edit, scope diagnostics to the edited bundles while continuing to supply the full source snapshot:

```ts
const updated = await checkProject({
	project,
	files,
	bundleIds: [editedBundleId],
});
```

Replace diagnostics for those bundles, rather than replacing the entire project's results with the scoped result. An empty `bundleIds` array returns no diagnostics. Settings changes or a new source revision require a full refresh.

The SDK keeps one source-analysis snapshot per project and invalidates it when file paths/content, settings or analyzer identities change. Translation edits do not reparse unchanged source. `missing-translation` and `unused-message` read IDs, locales and revision metadata only; the translation checks (on by default) load every bundle's patterns, see the scalability numbers below. Fixes always perform fresh analysis. Results are computed on request; there is no background polling or stored diagnostic state. Large initial source scans can be run in an application-owned worker.

The real-Lix benchmark and measured limitations are documented in [the scalability profile](../benchmarks/README.md).

## Plugin capability

Plugins can expose a browser-compatible analyzer:

```ts
import type { InlangPlugin } from "@inlang/sdk";

const plugin: InlangPlugin = {
	key: "plugin.example.matcher",
	analyzeUsage: async ({ files, settings }) => ({
		usedBundleIds: ["welcome"],
		status: "complete",
	}),
};
```

Return canonical stored bundle IDs, including references passed as functions. Analyzers can also return `references` (bundle ID, path, start and end positions) for `findUsages`; the m-function matcher does. Return `incomplete` with issues whenever parsing or unresolved usage prevents a conclusion. The SDK unions usages across all installed analyzers; every analyzer must complete before unused findings are emitted. Analyzers must treat inputs as immutable: the SDK supplies frozen source records and an isolated, deeply frozen settings copy. Malformed runtime results and rejected analyzers are reported as incomplete and retried on the next check. The SDK validates and copies indexed result entries, normalizes issue metadata to `path` and `reason`, and isolates public result objects from its cache.
