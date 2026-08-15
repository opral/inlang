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
