# JSON Plugin for Inlang

> **Deprecated:** This plugin is deprecated in favor of the [inlang message format plugin](https://inlang.com/m/reootnfj/plugin-inlang-messageFormat), which provides a simpler, more robust solution.

This plugin is a general purpose plugin to read and write messages of json files.

> The plugin implements the current resource-plugin API (`toBeImportedFiles`,
> `importFiles`, and `exportFiles`) and retains its legacy callbacks for older
> consumers. In v2 projects, use `locale`; `{languageTag}` remains supported
> for existing configurations.

## Manual Installation

> We recommend using the install button, but if you want to do it manually:

- Add this to the modules in your `project.inlang/settings.json`
- Change the `sourceLanguageTag` if needed
- Include existing languagetags in the `languageTags` array

```json
{
	"sourceLanguageTag": "en",
	"languageTags": ["en", "de"],
	"modules": ["https://cdn.jsdelivr.net/npm/@inlang/plugin-json@latest/dist/index.js"],
	"plugin.inlang.json": {
		"pathPattern": "./resources/{locale}.json"
	}
}
```

## Example

_messages/en.json_

```json
{
	"hello": "Hello {name}!",
	"loginButton": "Login"
}
```

_messages/de.json_

```json
{
	"hello": "Hallo {name}!",
	"loginButton": "Anmelden"
}
```

# Settings

The plugin offers further configuration options that can be passed as arguments. The following settings exist:

Here is the syntax for the PluginSettings object in TypeScript:

```typescript
type PluginSettings = {
	pathPattern: string | { [key: string]: string }
	variableReferencePattern?: [string] | [string, string]
	ignore?: string[]
}
```

## `pathPattern`

To use our plugin, you need to provide a path to the directory where your language-specific files are stored. Use the dynamic path syntax `{locale}` to specify the language name. The legacy `{languageTag}` placeholder remains supported.

### Without namespaces

```json
"plugin.inlang.json": {
	"pathPattern": "./resources/{locale}.json"
}
```

### With namespaces

> Does not get created by 'npx @inlang/cli config init'

```json
"plugin.inlang.json": {
	"pathPattern": {
		"website": "./resources/{locale}/website.json",
		"app": "./resources/{locale}/app.json"
	}
}
```

## `variableReferencePattern`

Defines the pattern for variable references. The default is how i18next suggests the usage of placeholders.

default:

```json
"plugin.inlang.json": {
	"variableReferencePattern": ["{", "}"]
}
```

**Common use cases**

| Placeholder       | Pattern        |
| ----------------- | -------------- |
| `{placeholder}`   | `["{", "}"]`   |
| `{{placeholder}}` | `["{{", "}}"]` |
| `${placeholder}`  | `["${", "}"]`  |
| `%placeholder`    | `["%"]`        |
| `[placeholder]`   | `["[", "]"]`   |
| `:placeholder`    | `[":"]`        |

## `ignore`

An array of strings that are used to ignore certain files. The strings are matched against the file path. If the file path contains the string, the file is ignored.

```json
"plugin.inlang.json": {
	"ignore": ["node_modules", "dist"]
}
```

# Expected behavior

The message IDs are sorted in the order in which they appear in the sourceLanguage file. The nesting or flattening of IDs is detected on a file-by-file basis. If the sourceLanguage file contains nested IDs, the plugin will also create nested IDs in the targetLanguage files. If the sourceLanguage file contains flattened IDs, the plugin will also create flattened IDs in the targetLanguage files.

# Contributing

## Getting started

Run the following commands in your terminal (node and npm must be installed):

1. `npm install`
2. `npm run dev`

`npm run dev` will start the development environment which automatically compiles the [src/index.ts](#getting-started) files to JavaScript ([dist/index.js](#getting-started)), runs tests defined in `*.test.ts` files and watches changes.

## Translation descriptions

The inlang SDK exposes shared translation guidance as `bundle.description`. Since this format has no native description field, the SDK automatically saves descriptions in the Git-tracked `project.inlang/descriptions.json` companion file. Runtime translation files keep their usual shape. Keep the companion with the project when sharing or converting files; SDK portable exports include it. See [the data model](../../../docs/data-model.md) for the field contract.
