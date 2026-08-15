# Apple String Catalog plugin for Inlang

Reads and writes Xcode 15+ `.xcstrings` catalogs through Inlang's v2 message model.

Supported: exact keys, all catalog locales, positional printf variables, one plural variation, or one Apple device variation per message. Nested or multiple variations and source-only entries without a recoverable value fail explicitly rather than being flattened.

This is a content adapter. Catalog workflow metadata such as comments, extraction state, translation state, and `shouldTranslate` is not represented by Inlang's v2 message tables and is regenerated on export.

```json
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-apple-xcstrings@latest/dist/index.js"
  ],
  "plugin.inlang.apple-xcstrings": {
    "pathPattern": "./Localizations/Localizable.xcstrings"
  }
}
```
