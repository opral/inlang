---
"@inlang/plugin-apple-xcstrings": patch
---

Catalogs that Xcode writes can be imported. Most of them have strings without localizations: strings extracted from code that nobody translated yet (`"Welcome" : { }`), strings with only a `comment`, `"shouldTranslate" : false`, and stale or manual strings. Importing such a catalog used to fail with "source-only entry … has no localization value to import".

Like Xcode at runtime, a string without a localization of the source language uses its key as the source language value. The plugin imports the key as the source language message, so editors show it and translators can translate it. The export doesn't write it back, so these strings stay exactly as Xcode wrote them, and a translation only adds the translated locale. A source language localization that the catalog has is kept, even if its value is the key.

Also fixed:

- Catalogs of version 1.1 and 1.2, which Xcode 26 writes, can be imported, and their version is kept.
- Implicit printf arguments with flags, width or precision, such as `%.2f` or `%5d`, are read as variables. Before, they failed the import.
- A key or value that isn't a format string the plugin can read, e.g. one that mixes positional and implicit arguments, is imported as text and written back as it is, instead of failing the import of the whole catalog.
- A string whose only translation is removed is written like Xcode writes empty strings.
