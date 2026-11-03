---
og:title: "Settings Reference"
og:description: "Reference documentation for inlang project settings configuration."
---

# Settings Reference

Project settings are defined in `project.inlang/settings.json`. This document covers all available settings.

## Core Settings

```typescript
type ProjectSettings = {
  $schema?: string;
  baseLocale: string;
  locales: string[];
  translationDescriptors?: string;
  modules?: string[];
  experimental?: Record<string, true>;
};
```

### baseLocale

**Required.** The base locale of your project. All other translations are derived from this locale.

```json
{
  "baseLocale": "en"
}
```

Must be a valid [BCP-47 language tag](https://www.w3.org/International/articles/language-tags/).

### locales

**Required.** All locales available in your project, including the base locale.

```json
{
  "baseLocale": "en",
  "locales": ["en", "de", "fr", "es"]
}
```

- Must include `baseLocale`
- Each locale must be a valid BCP-47 language tag
- Duplicates are not allowed

### translationDescriptors

Optional path to a YAML file containing message descriptions for machine translation. The path is relative to the project directory.

The SDK-native format uses exact inlang bundle IDs as top-level keys, with a `description` passed as translation context to providers that support it:

```json
{
  "translationDescriptors": "./descriptors.yml"
}
```

```yaml
"misc:port":
  description: in computing
"misc:portRange":
  description: in computing
```

For compatibility with i18n-ally review files, entries can instead be nested under a top-level `reviews` key. In that format, each key uses `<namespace>.<key>`; the SDK converts the first dot to `:` to match an inlang bundle ID, preserving any later dots in the key:

```yaml
reviews:
  misc.port:
    description: in computing
  misc.port.range:
    description: in computing
```

OpenAI and DeepL use these descriptions. Google Translate and the default community-operated provider do not support contextual descriptions, so the CLI warns and continues without them.

### modules

URIs to plugin modules. Plugins extend inlang with import/export capabilities for different i18n formats.

```json
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@6.1.4/dist/index.js",
    "./local-plugin.js"
  ]
}
```

- Must be valid URIs (RFC 3986)
- Must end with `.js`
- Can be absolute (CDN) or relative paths
- Pin plugin versions that support the current SDK import/export API. For i18next, use `@inlang/plugin-i18next@6` or newer.

### experimental

Enable experimental features. Keys are feature names, values must be `true`.

```json
{
  "experimental": {
    "newFeature": true
  }
}
```

## Plugin Settings

Plugins define their own settings schemas. Plugin settings use the prefix `plugin.<plugin-id>`.

```json
{
  "plugin.inlang.i18next": {
    "pathPattern": "./locales/{locale}.json"
  }
}
```

See each plugin's marketplace page for available settings.

## Example

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "de", "fr", "es"],
  "translationDescriptors": "./descriptors.yml",
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@6.1.4/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-t-function-matcher@3/dist/index.js"
  ],
  "plugin.inlang.i18next": {
    "pathPattern": {
      "common": "./locales/{locale}/common.json",
      "errors": "./locales/{locale}/errors.json"
    },
    "variableReferencePattern": ["{{", "}}"]
  }
}
```

## Deprecated Settings

These settings are deprecated and will be removed in SDK v3:

| Setting                  | Replacement      |
| ------------------------ | ---------------- |
| `sourceLanguageTag`      | Use `baseLocale` |
| `languageTags`           | Use `locales`    |
| `{languageTag}` in paths | Use `{locale}`   |

## Next Steps

- [Getting Started](/docs/getting-started) — Set up your first project
- [Plugin API](/docs/plugin-api) — Build custom plugins
- [Architecture](/docs/architecture) — Understand the system design
