# Apple String Catalog plugin for Inlang

Reads and writes Xcode 15+ `.xcstrings` catalogs through Inlang's v2 message model.

Supported: catalog versions 1.x (Xcode 15 writes 1.0, Xcode 26 writes 1.1 and 1.2), exact keys, all catalog locales, positional and implicit printf variables (implicit ones with width and precision, e.g. `%.2f` and `%5d`), Xcode's `%arg` placeholder (written as `%1$arg`), one plural variation, or one Apple device variation per message. Nested or multiple variations fail explicitly rather than being flattened. A key or value that isn't a format string the plugin can read (e.g. positional and implicit arguments mixed, `%1$@ %@`) is imported as text and written back unchanged. Flags are only read for positional arguments (`%1$-5s`): with an implicit argument they would turn prose such as `50%-off`, `10%-ige` or `100%'s` into variables, so these stay text. A `%` directly followed by a conversion is still an argument, like in printf, e.g. `10%ige` reads as `%i`; write `%%` for a literal percent sign. In a plural substitution, a variant (or the text around `%#@name@`) that the plugin reads as text but that has a `%` keeps the text around `%#@name@` with it, so it displays the same when the plugin writes it.

Strings without a localization of the source language use their key as the source language value, as Xcode does at runtime. This covers strings extracted from code that nobody translated yet (`"Welcome" : { }`), strings with `"shouldTranslate" : false`, and stale or manual strings. The plugin imports that value as the source language message, so editors show it and translators can translate it. The plugin doesn't write it back: such a string keeps its shape on export, and translating it only adds the translated locale.

A source language value equal to the key is written only if the catalog already has it, e.g. Xcode's `"Pos %1$@ %2$lld"` for the key `"Pos %@ %lld"`.

Strings with `"shouldTranslate" : false` also get a source language message, so lint rules and machine translation may offer to translate them. A translation of such a string is written next to `shouldTranslate`, which Xcode compiles as usual.

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
