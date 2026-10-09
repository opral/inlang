---
"@inlang/plugin-android": patch
---

Importing real-world `strings.xml` files no longer fails on `translatable="false"`, `tools:` attributes (e.g. `tools:ignore="MissingTranslation"`) or `formatted="false"`.

- Non-translatable strings and plurals (app name, URLs, API keys) are not imported as messages, so they are never written to the files of other locales, also not when another locale has a message with their name. `translatable` and `formatted` are read like Android reads booleans (`false`, `FALSE`, `False`).
- `formatted="false"` strings are read as text, so a raw `%` (e.g. `Save 50% on %s`) works, and text that would read as a placeholder is written with `formatted="false"`.
- `formatted="false"` on `<plurals>` is honored the same way.
- A `<string>` and a `<plurals>` may share a name if at most one of them is translatable, and non-translatable product variants (`product="tablet"`) are accepted.
- Locales with a region use the qualifier Android Studio writes: `pt-BR` is read from and written to `values-pt-rBR/` (previously `values-b+pt+BR/`, which is still read and, if it exists, written). Scripts and numeric regions keep BCP 47 (`values-b+zh+Hans/`, `values-b+es+419/`). Every `{locale}` of the `pathPattern` is replaced.
- An empty `<resources></resources>` or `<resources/>` (a locale without translations yet) imports as no messages instead of failing.
- With a host that passes the existing files to the export (inlang SDK 4), saving keeps non-translatable resources byte for byte, edited strings and plural items (also self-closing ones) keep their attributes, and the files are written to their Android paths: `saveProjectToDirectory` wrote them to `res/valuesen/strings.xml` and `res/valuesde/strings.xml` instead of `res/values/` and `res/values-de/`. Hosts without the existing files (inlang SDK 3) write the whole-file export where they did before.
