---
og:title: ICU MessageFormat v1 Plugin
og:description: Storage plugin for inlang that reads and writes ICU MessageFormat v1 JSON files. Supports selects, plurals, selectordinal, offsets, and formatter styles.
---

# ICU MessageFormat v1 Plugin

The ICU MessageFormat v1 plugin is a storage plugin for inlang. It reads and writes ICU1 strings in JSON files per locale.
It targets ICU MessageFormat v1 (a.k.a. ICU MessageFormat) and maps it onto inlang's data model so selectors and variants are preserved.

## Features

- Parses ICU1 messages using `@messageformat/parser`.
- Supports `select`, `plural`, and `selectordinal`, including exact matches (`=n`) and `offset`.
- Supports `#` (octothorpe) inside plural/selectordinal cases. `#` imports as `{$count :icu:pound}`, with an `offset` option when the plural has one (`{$count :icu:pound offset=1}`), because `#` displays `count - offset`.
- Supports formatter functions (e.g. `number`, `date`, `time`, `spellout`, `ordinal`, `duration`) with style parameters.
- Exports ICU1 strings back from inlang data.

## Installation

Install the plugin in your Inlang Project by adding it to your `modules` in `project.inlang/settings.json` and configure `pathPattern`.

```diff
// project.inlang/settings.json
{
  "modules": [
+    "https://cdn.jsdelivr.net/npm/@inlang/plugin-icu1@latest/dist/index.js"
  ],
+ "plugin.inlang.icu-messageformat-1": {
+   "pathPattern": "./messages/{locale}.json"
+ }
}
```

## Configuration

Configuration happens in `project.inlang/settings.json` under `"plugin.inlang.icu-messageformat-1"`.

### `pathPattern`

You can define a single `pathPattern` or provide an array of patterns. The placeholder should be `{locale}`.

#### Single path pattern example

```json
{
  "plugin.inlang.icu-messageformat-1": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

#### Multiple path patterns example

```json
{
  "plugin.inlang.icu-messageformat-1": {
    "pathPattern": ["./defaults/{locale}.json", "./product/{locale}.json"]
  }
}
```

> [!NOTE]
> When exporting, all messages are written to every path pattern in the array (one file per pattern and locale). Multiple patterns are a one-way merge for import.

## Messages

ICU1 files contain key-value pairs with ICU MessageFormat strings.

```json
// messages/en.json
{
  "hello_world": "Hello World!",
  "greeting": "Good morning {name}!",
  "likes": "You have {count, plural, one {# like} other {# likes}}"
}
```

### Plurals and selectordinal

```json
{
  "items": "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
  "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}"
}
```

### Select

```json
{
  "gender": "{gender, select, male {He} female {She} other {They}}"
}
```

### Escaping

ICU1 uses apostrophes to escape literals. To include literal braces, wrap them in apostrophes:

- `'{'
- `'}'`

If you need a literal apostrophe, use `''` (two single quotes).

## Caveats

- Export is canonicalized. Output is semantically equivalent, but whitespace and formatting may differ from the original source.
- Tags/markup are treated as plain text by the parser.
