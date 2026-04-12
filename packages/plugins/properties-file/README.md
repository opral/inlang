# @inlang/plugin-properties-file

Store translations in Java `.properties` files for use with [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) and other inlang-compatible tools.

Uses the [`properties-file`](https://github.com/properties-file/properties-file) package for robust parsing and serialization of the `.properties` format, including Unicode escapes, multi-line values, and comment handling.

## Installation

Add the plugin to your `project.inlang/settings.json`:

```json
{
  "baseLocale": "en",
  "locales": ["en", "fr", "de"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-properties-file@latest/dist/index.js"
  ],
  "plugin.inlang.propertiesFile": {
    "pathPattern": "./messages/{locale}.properties"
  }
}
```

## File format

Each locale has its own `.properties` file. Keys map directly to bundle IDs.

```properties
# Welcome message shown on the home page
greeting = Hello {name}!
items.count = You have {count} items
farewell = Goodbye
```

## Variable interpolation

Variables use the `{variableName}` syntax inside values:

```properties
welcome = Welcome back, {username}!
notification = {sender} sent you {count} messages
```

These are converted to inlang expression pattern elements and declared as input variables on the bundle.

## Comment support

Comments immediately preceding a key-value pair are preserved during import and restored on export:

```properties
# This comment will be preserved
greeting = Hello {name}!
```

## Settings reference

| Setting        | Type                          | Required | Description                                                      |
| -------------- | ----------------------------- | -------- | ---------------------------------------------------------------- |
| `pathPattern`  | `string \| string[]`         | Yes      | Path(s) to `.properties` files. Must include `{locale}` and end with `.properties`. |
| `sort`         | `"asc" \| "desc"`            | No       | Sort keys alphabetically when exporting.                         |

### Multiple path patterns

You can specify multiple path patterns to load translations from several directories:

```json
{
  "plugin.inlang.propertiesFile": {
    "pathPattern": [
      "./messages/{locale}.properties",
      "./overrides/{locale}.properties"
    ]
  }
}
```

### Key sorting

Enable alphabetical key sorting on export:

```json
{
  "plugin.inlang.propertiesFile": {
    "pathPattern": "./messages/{locale}.properties",
    "sort": "asc"
  }
}
```
