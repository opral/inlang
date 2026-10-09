# m Function Matcher for Sherlock

This plugin enables [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension) (VS Code extension) to recognize `m.message()` function calls used by [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs).

![Sherlock inline preview](https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@latest/assets/sherlock-preview.svg)

## What it does

- **Inline previews**: See translations directly in your code editor
- **Message extraction**: Extract hardcoded strings into messages
- **Linting**: Get warnings for missing or invalid message references

## Supported file types

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- Svelte (`.svelte`)
- Vue (`.vue`)
- Astro (`.astro`)

## Installation

Add the plugin to your `project.inlang/settings.json`:

```json
{
	"modules": [
		"https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@latest/dist/index.js"
	]
}
```

Then install [Sherlock](https://marketplace.visualstudio.com/items?itemName=inlang.vs-code-extension) from the VS Code marketplace.

## Matched patterns

The plugin recognizes these patterns:

| Pattern        | Example                         |
| -------------- | ------------------------------- |
| Simple call    | `m.welcome()`                   |
| With variables | `m.greeting({ name: "World" })` |
| In JSX         | `{m.button_label()}`            |

## Project checks

Find unused messages with the [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli):

```sh
npx @inlang/cli check --project ./project.inlang --unused-messages
```

The plugin exposes `analyzeUsage` for the SDK's `checkProject({ project, files })` API. ESM JavaScript/TypeScript and Svelte AST analysis recognizes static message reads, function references, named imports and namespace imports. Dynamic accesses, namespace escapes, parse failures and unsupported formats report incomplete analysis, which withholds unused-message findings and deletion fixes. Each issue names the file and, where possible, the location (`start`/`end`) of the construct, e.g. ``m[`${fieldName}_label`]``.

See the [SDK checks and fixes documentation](../../sdk/docs/checks.md) for source snapshot requirements, supported syntax, limits and programmatic usage. This capability is separate from the existing IDE reference matchers.

Bundle size: the analysis bundles Babel's parser and Svelte's compiler, so `dist/index.js` is about 830 KB minified (28 KB before). It is not lazy-loaded: the SDK imports a plugin module as a single `data:` URL, where a separately loaded chunk can't be resolved.

Svelte analysis covers instance/module scripts (JavaScript or TypeScript) and template expressions, blocks, snippets, components and directives. Include `.svelte` files in the full source snapshot; no extra configuration is required. External scripts and unsupported script languages report incomplete analysis.
