# Apple String Catalog plugin for Inlang

Reads and writes Xcode 15+ `.xcstrings` catalogs through Inlang's v2 message model.

Supported: exact keys, all catalog locales, positional printf variables, one plural variation, or one Apple device variation per message. Nested or multiple variations fail explicitly rather than being flattened.

Strings without a localization of the source language, e.g. strings extracted from code that nobody translated yet (`"Welcome" : { }`), strings with `"shouldTranslate" : false`, stale or manual strings, use their key as the source language value, like Xcode does at runtime. The plugin imports that value as the source language message, so that editors show it and it can be translated. It doesn't write it back: such a string keeps its shape on export, and translating it only adds the translated locale. A source language message whose value is the key is never written, Xcode uses the key.

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
