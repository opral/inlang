# Project checks and fixes

Translation projects accumulate missing translations and messages whose application usages have been removed. Inlang provides the same checks to editors, scripts and CI through `checkProject`. Checks produce derived results; they do not mutate the project, start subscriptions or read application files.

## Check translations

```ts
import { checkProject } from "@inlang/sdk";

const result = await checkProject({ project });
```

`missing-translation` reports a bundle that has no message row for a configured locale, including the base locale. An existing empty pattern is not a missing translation. This release does not check empty patterns, syntax, duplicate text or plural coverage; parsing/import errors remain separate.

Intentional fallback can exempt individual bundle/locale combinations:

```ts
const result = await checkProject({
	project,
	ignoreMissingTranslations: [{ bundleId: "brand_name", locale: "de" }],
});
```

These exclusions are supplied by the caller; the SDK does not persist them or change fallback behavior.

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

Known evaluator/loader references, indirect function-constructor access, and dynamic access to or escapes of global objects (`globalThis`, `window`, `self`, `global`, `parent`, `top`, `frames`, `opener`) also make analysis incomplete. These guards are conservative: passing a global object as a value or reading a non-message object’s `constructor` can withhold findings even when the application does not evaluate code. Possible global-object member aliases (such as `window`, `parent`, `top`, `contentWindow` and `defaultView`) also withhold findings. Timer references (`setTimeout`/`setInterval`) require inline function handlers: string handlers, aliases and handlers whose type is unresolved make analysis incomplete. Ordinary static global members and `typeof window` remain supported.

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

The SDK keeps one source-analysis snapshot per project and invalidates it when file paths/content, settings or analyzer identities change. Translation edits do not reparse unchanged source. Checks read IDs, locales and revision metadata; translation patterns are not loaded. Fixes always perform fresh analysis. Results are computed on request; there is no background polling or stored diagnostic state. Large initial source scans can be run in an application-owned worker.

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

Return canonical stored bundle IDs, including references passed as functions. Return `incomplete` with issues whenever parsing or unresolved usage prevents a conclusion. The SDK unions usages across all installed analyzers; every analyzer must complete before unused findings are emitted. Analyzers must treat inputs as immutable: the SDK supplies frozen source records and an isolated, deeply frozen settings copy. Malformed runtime results and rejected analyzers are reported as incomplete and retried on the next check. The SDK validates and copies indexed result entries, normalizes issue metadata to `path` and `reason`, and isolates public result objects from its cache.
