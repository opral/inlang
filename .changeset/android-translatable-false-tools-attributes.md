---
"@inlang/plugin-android": patch
---

Importing real-world `strings.xml` files no longer fails on `translatable="false"`, `tools:` attributes (e.g. `tools:ignore="MissingTranslation"`) or `formatted="false"`. Non-translatable strings and plurals (app name, URLs, API keys) are not imported as messages, so they are never written to the files of other locales, and saving keeps them byte for byte. Edited strings and plural items keep their attributes, e.g. `tools:ignore`. An empty `<resources>` element (a locale without translations yet) imports as no messages instead of failing.
