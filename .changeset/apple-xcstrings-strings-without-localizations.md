---
"@inlang/plugin-apple-xcstrings": patch
---

Catalogs with strings that have no localizations can be imported. Most catalogs Xcode writes have them: strings extracted from code that nobody translated yet (`"Welcome" : { }`), strings with only a `comment`, `"shouldTranslate" : false`, stale or manual strings. Before, importing such a catalog failed with "source-only entry … has no localization value to import".

Like Xcode at runtime, the key of a string without a localization of the source language is its source language value: the plugin imports it as the source language message, so that editors show it and translators can translate it. The export doesn't write it back, so these strings stay exactly as Xcode wrote them, and a translation only adds the translated locale. A source language message whose value is the key isn't written by the export without the existing catalog either, since Xcode uses the key.
