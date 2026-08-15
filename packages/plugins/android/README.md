# Android Resources plugin for Inlang

Reads and writes Android `strings.xml` files through Inlang's v2 message model.

Supported: exact message keys, XML escaping, positional string variables, and CLDR plural quantities (`zero`, `one`, `two`, `few`, `many`, `other`). Unsupported selector shapes and annotated expressions fail explicitly instead of being dropped.

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
