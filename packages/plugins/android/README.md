# Android Resources plugin for Inlang

Reads and writes Android `strings.xml` files through Inlang's v2 message model.

Supported: exact message keys, XML escaping, positional string variables, and CLDR plural quantities (`zero`, `one`, `two`, `few`, `many`, `other`). Unsupported selector shapes and annotated expressions fail explicitly instead of being dropped.

Non-translatable resources (`translatable="false"`, e.g. the app name, URLs or API keys) are not imported as messages, so they are never written to the files of other locales. A message of another locale with the name of a non-translatable resource of the base locale file (e.g. created in an editor) is not written either, unless the file of that locale has it already. Attributes such as `tools:ignore`, `tools:locale` or `formatted="false"` are accepted. `formatted="false"` strings and plurals are read as plain text, so a raw `%` (`Save 50% on %s`) works; their `%s` and `%d` are text, not placeholders, so editors and machine translation don't protect them. Non-translatable product variants (`product="…"` with `translatable="false"`) are kept as they are. Resource names are unique per type, so a `<string>` and a `<plurals>` may share a name if at most one of them is translatable. Inline markup inside a string (e.g. `<xliff:g>` or `<b>`) and translatable product-specific strings (`product="…"`) are not supported and fail explicitly. In a plural with placeholders, an item that is only text must not contain text that reads as a placeholder (e.g. a literal `%s`).

Hosts that pass the existing files to the export (inlang SDK 4) keep everything the plugin doesn't import byte for byte (non-translatable resources, `<string-array>`s, comments, …), keep the attributes of edited elements, and write each file to its Android path (`res/values/`, `res/values-de/`). Hosts without the existing files (inlang SDK 3) get the whole-file export as before, which contains only the messages.

```json
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-android@latest/dist/index.js"
  ],
  "plugin.inlang.android": {
    "pathPattern": "./res/values{locale}/strings.xml"
  }
}
```

`{locale}` expands to an Android resource qualifier: the base locale uses no
suffix, `de` uses `-de`, `pt-BR` uses `-pt-rBR` (as Android Studio writes it),
and locales with a script or a numeric region use BCP 47, e.g. `zh-Hans` uses
`-b+zh+Hans` and `es-419` uses `-b+es+419`. An existing `values-b+pt+BR/` is
read and written too. A locale with files in both spellings is rejected,
because inlang writes all messages of a locale to one file.
