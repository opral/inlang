# i18next Plugin for Inlang

This plugin enables your inlang project to read and write [i18next](https://inlang.com/m/kl95463j) translation files.

![i18next plugin for inlang](https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@latest/assets/banner.svg)

## Why use this plugin?

If you're using i18next for internationalization, this plugin lets you:

- **Manage translations** with [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor) – a translation editor for collaborating with translators
- **Get inline previews** with [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension) – a VS Code extension that shows translations directly in your code
- **Lint translations** with [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) – catch missing translations, unused keys, and other issues
- **Automate workflows** with the inlang SDK – build custom tooling around your translations

## How it works

The plugin reads and writes i18next JSON files, preserving your existing file structure (nested or flat keys, namespaces, plurals). It also tells Sherlock how to detect `t()` function calls in your code so you see inline translation previews.

If you use [locize](https://locize.com/) as a hosted TMS for i18next, you can keep using the same i18next resources. The plugin lets inlang tools work alongside that setup.

# Supported i18next Features

| Feature | Status | Notes |
|---------|--------|-------|
| Basic key-value pairs | ✅ Supported | Fully working |
| Nested keys | ✅ Supported | Auto-detects flat vs nested structure |
| Variable interpolation | ✅ Supported | `{{variable}}` with customizable patterns |
| Unescaped interpolation | ✅ Supported | `{{- variable}}` syntax |
| Formatting | ✅ Supported | Simple format functions like `{{value, uppercase}}` |
| Formatting with options | ❌ Not supported | `{{value, format, option}}` will throw an error on export |
| Plurals | ✅ Supported | All forms: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` |
| Ordinal plurals | ✅ Supported | Forms like `_ordinal_one`, `_ordinal_two`, `_ordinal_few`, `_ordinal_other` |
| Context | ✅ Supported | Context suffix detection (e.g., `key_male`) including context + plural combinations |
| Namespaces | ✅ Supported | Single and multiple namespace configurations |
| Nesting (`$t()`) | ⚠️ Read-only | Recognized but cannot be translated inline |
| Objects/Arrays as values | ✅ Supported | Preserved during roundtrip |

## Version Compatibility

- **i18next v21+**: Full support (uses JSON v4 plural format with `_one`, `_other`, etc.)
- **i18next v11-v20**: Full support
- **i18next v1-v10**: Limited support (older plural format `_plural` may need migration)

## Installation

### Existing i18next projects

The quickest setup is the official i18next CLI:

```sh
npx i18next-cli init --inlang
```

The command creates `project.inlang/settings.json` for your existing i18next JSON files and pins a compatible `@inlang/plugin-i18next` version.

### Manual setup

- Add this to the modules in your `project.inlang/settings.json`
- Change the `baseLocale` if needed 
- Include existing locales in the `locales` array

```diff
{
	"baseLocale": "en",
	"locales": ["en", "de"], 
	"modules": [
+		"https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@latest/dist/index.js"
  	],
+	"plugin.inlang.i18next": {
+		"pathPattern": "./resources/{locale}.json"
+  	}
}
```

# Settings

The plugin offers further configuration options that can be passed as arguments. The following settings exist:

```typescript
type PluginSettings = {
	pathPattern: string | { [key: string]: string }
	variableReferencePattern?: [string] | [string, string]
	contextValues?: string[]
	sourceLanguageFilePath?: string
}
```

## `contextValues`

i18next determines context from the `t()` call. JSON alone cannot distinguish
`t("friend_male")` from `t("friend", { context: "male" })`. Supply the project's
context values to import single-context resources and values containing underscores
without truncating literal underscored keys:

```json
"plugin.inlang.i18next": {
	"pathPattern": "./resources/{locale}.json",
	"contextValues": ["male", "female", "male_formal", "female_formal"]
}
```

Context suffixes are recognized after plural suffixes are removed; the longest
configured suffix wins. `contextValues: []` disables context detection. When the
setting is omitted, sibling or base keys establish context roots across all locales
of each namespace. This inference is a heuristic; use explicit values for ambiguous
resources. The setting changes import classification, not i18next's runtime options.

## Mixed cardinal and ordinal bundles

When a bundle contains both cardinal and ordinal forms, its imported MF2 message
declares a `pluralType` input. Pass `"cardinal"` for a normal count lookup and
`"ordinal"` for the equivalent of i18next's `ordinal: true` option:

```js
// i18next
i18next.t("rank", { count: 1, ordinal: true });
// Imported MF2 consumer (for example, a generated Paraglide function)
m.rank({ count: 1, pluralType: "ordinal" });
```

Pure cardinal and pure ordinal bundles keep a fixed plural type and only need
`count`. Mixed bundles evaluate categories using the requested type, prioritize
explicit ordinal keys, and fall back to cardinal suffix keys using that same
ordinal category. The exact `_zero` override applies only to cardinal lookups;
`_ordinal_zero` remains an ordinal category. Export restores the original suffixes.

## `pathPattern`

To use our plugin, you need to provide a path to the directory where your language-specific files are stored. Use the dynamic path syntax `{locale}` to specify the language name.

### pathPattern without namespaces

```json
"plugin.inlang.i18next": {
	"pathPattern": "./resources/{locale}.json"
}
```

### pathPattern with namespaces


```json
"plugin.inlang.i18next": {
	"pathPattern": {
		"common": "./resources/{locale}/common.json",
		"vital": "./resources/{locale}/vital.json"
	}
}
```

`key` (prefix): is prefixing the key with a colon
`values` (path): is the path to the namespace resources

## `variableReferencePattern`

This defines the pattern for variable references. The default is how [i18next](https://inlang.com/m/kl95463j) suggests using placeholders.

default:

```json
"plugin.inlang.i18next": {
	"variableReferencePattern": ["{{", "}}"]
}
```

## `sourceLanguageFilePath`

This setting is optional and should only be used if the file name of your sourcelocale does not match your pathPattern structure. For example, if your sourcelocale is `en` but your sourceLanguage file is called `main.json`, you can use this setting to specify the path to the sourceLanguage file. We recommend renaming the file to `en.json` and not using this setting.

### Without namespaces

```json
"plugin.inlang.i18next": {
	"sourceLanguageFilePath": "./resources/main.json"
}
```

### With namespaces

```json
"plugin.inlang.i18next": {
	"sourceLanguageFilePath": {
		"common": "./resources/main/common.json",
		"vital": "./resources/main/vital.json"
	}
}
```

# In-code usage

`t("key")`

With namespaces:

`t("namespace:key")` or `t("key", { ns: "namespace" })`

To learn about namespaces and how to use translation functions in your code, refer to the [i18next documentation](https://www.i18next.com/principles/namespaces). The plugin can parse the code and provide the VS Code extension (Sherlock) with this information.

# Expected behavior

## Structure and Ordering

The **source language file determines the structure** for all other locale files:

- **Key ordering**: Messages are sorted in the order they appear in the source language file
- **Nesting vs flat**: Detected per-file from the source language. If your `en.json` uses nested keys, all other locales will use nested keys too
- **New keys**: When you add translations for other locales, they follow the source file's structure

### Example

If your source language (`en.json`) looks like this:
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  }
}
```

Then your target language (`de.json`) will be written in the same nested structure:
```json
{
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen"
  }
}
```

## Plural Key Generation

Plural forms are automatically generated with i18next suffixes:

| Input | Generated keys |
|-------|----------------|
| Message with `count` variable | `key_one`, `key_other` (minimum) |
| Full plural support | `key_zero`, `key_one`, `key_two`, `key_few`, `key_many`, `key_other` |

The plugin uses the CLDR plural rules for each locale to determine which plural forms are needed.

## Exact numbers (`_zero`)

i18next looks up `key_zero` whenever `count === 0`, in every language and before the plural category (French `_one` also covers 0, yet `_zero` wins). It only does so for cardinal plurals. `_zero` is i18next's only exact-number form.

| inlang (MessageFormat 2) | i18next |
|---|---|
| exact `0` on `count`, or on an un-annotated alias of it such as `.local countPluralExact = {$count}` (ICU `{count, plural, =0 {…}}`, editors' "add exact number") | `key_zero` |
| `countPlural` category `zero` (Latvian, Arabic, …) | `key_zero` |
| other exact numbers (`=1`, `=5`), an exact number of an ordinal plural, a Latvian exact `0` without a `zero` form of the same text | not representable: export fails with an error naming the bundle and number |

Where the `zero` category covers more than 0 (Latvian: 10, 11–19, 20, …), i18next uses `key_zero` for all of those counts, so an exact `0` alone cannot be expressed: its text would also show for 10, 11, 20. There an exact `0` exports only next to a `zero` form with the same text; otherwise the export fails with an error.

On import, `key_zero` becomes one form: an exact `count = 0` match next to `countPlural`. Editors and the inlang SDK treat `count` and `countPlural` as one choice, like `countPluralExact` and `countPlural`. Only where the `zero` category also selects other numbers (Latvian: 10, 11–19, 20, …) is a second form with `countPlural = zero` imported. Both forms export to `key_zero`, so they need the same text; if they differ, the export fails instead of dropping one.

# Limitations

The following i18next features are **not supported** by this plugin:

| Feature | Limitation |
|---------|------------|
| **Formatting with options** | `{{value, number(minimumFractionDigits: 2)}}` will throw "Not implemented" error on export |
| **Inline nesting** | `$t(key)` references are read but cannot be edited or translated inline |
| **Postprocessors** | Runtime-only feature, not applicable to static translation files |
| **Template literal strings** | Only single and double quoted strings are parsed in code |
| **Custom `t` function aliases** | Only standard `t()` function calls are detected by Sherlock |
| **Exact numbers other than 0** | i18next has no form for ICU `=1`, `=5`, …; export reports them instead of writing a wrong plural |

# Troubleshooting

## "Not implemented" error when saving

**Cause**: You're using formatting functions with options like `{{value, number, minimumFractionDigits: 2}}`.

**Solution**: Simplify to basic formatting `{{value, number}}` or use plain variables `{{value}}`. Complex formatting options are not supported.

## Keys appear duplicated or out of order

**Cause**: The source language file structure doesn't match what the plugin expects.

**Solution**:
1. Ensure your source language file (e.g., `en.json`) is valid JSON
2. Check that the file structure is consistent (all nested or all flat)
3. The source language file is the "source of truth" for key ordering

## Plurals not working correctly

**Cause**: Using old i18next plural format or mismatched suffixes.

**Solution**:
- Use i18next v4 JSON format with suffixes: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`
- Old format (`key_plural`) is not supported - migrate to the new format
- Ensure the `count` variable is used in your translation

## Sherlock not detecting translation keys

**Cause**: Non-standard function names or unsupported file types.

**Solution**:
- Use the standard `t("key")` function call syntax
- Supported file types: `.ts`, `.js`, `.tsx`, `.jsx`, `.svelte`
- For namespaces, use `t("namespace:key")` or `t("key", { ns: "namespace" })`

## Nested keys with dots in the key name

**Cause**: Keys like `"my.key.name"` are ambiguous - could be nested or a literal dot in the key.

**Solution**: The plugin handles this automatically using unicode escaping. Keys with literal dots are preserved correctly during roundtrip.

## Changes not appearing in target language files

**Cause**: Target files don't exist or path pattern is incorrect.

**Solution**:
1. Verify your `pathPattern` matches your file structure
2. Check that the `{locale}` placeholder is in the correct position
3. Directories are created automatically, but the locale must be in your `locales` array

# Contributing

## Getting started

Run the following commands in your terminal (node and npm must be installed):

1. `npm install`
2. `npm run dev`

`npm run dev` will start the development environment which automatically compiles the [src/index.ts](#getting-started) files to JavaScript ([dist/index.js](#getting-started)), runs tests defined in `*.test.ts` files and watches changes.
