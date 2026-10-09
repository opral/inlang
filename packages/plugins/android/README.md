# Android Resources plugin for Inlang

Reads and writes Android `strings.xml` files through Inlang's v2 message model.

Supported: exact message keys, XML escaping, positional string variables, and CLDR plural quantities (`zero`, `one`, `two`, `few`, `many`, `other`). Unsupported selector shapes and annotated expressions fail explicitly instead of being dropped.

Non-translatable resources (`translatable="false"`, e.g. the app name, URLs or API keys) are not imported as messages, so they are never written to the files of other locales. Attributes such as `tools:ignore`, `tools:locale` or `formatted="false"` are accepted. When the existing files are available (inlang SDK 4), saving keeps non-translatable resources, `<string-array>`s and other elements byte for byte, and keeps the attributes of edited elements. Inline markup inside a string (e.g. `<xliff:g>` or `<b>`) and product-specific strings (`product="…"`) are not supported and fail explicitly.

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
suffix, `de` uses `-de`, and `en-US` uses `-b+en+US`.
