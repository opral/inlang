# Apple Strings plugin for Inlang

Reads and writes Apple `.strings` files through Inlang's v2 message model.

Supported: exact message keys, quoted-string escaping, Unicode, and positional variables. Apple `.strings` has no plural construct, so selector/plural messages fail explicitly. Use a future `.xcstrings` or `.stringsdict` plugin for Apple plurals.

```json
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-apple-strings@latest/dist/index.js"
  ],
  "plugin.inlang.apple-strings": {
    "pathPattern": "./Localizations/{locale}.lproj/Localizable.strings"
  }
}
```

The `{locale}` placeholder expands to the locale. `{language}` expands to the primary language subtag of the locale, e.g. `en` for `en-US`, so that files can be organized by base language. Locales that share a primary language, like `en-US` and `en-GB`, resolve to the same file with `{language}`; use `{locale}` when separate regional files are needed.
