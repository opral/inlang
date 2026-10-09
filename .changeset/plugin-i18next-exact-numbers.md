---
"@inlang/plugin-i18next": patch
---

Export exact numbers created by `@inlang/plugin-icu1` and editors.

- An exact `0` on an un-annotated alias of `count` (`.local countPluralExact = {$count}`, ICU `{count, plural, =0 {…}}`) exports as `key_zero`, like an exact `0` on `count` itself. i18next looks up `_zero` whenever `count === 0`, in every language, so lookups match the ICU message.
- Exact numbers i18next cannot express (`=1`, `=5`, exact numbers of ordinal plurals) fail the export with an error naming the bundle and number instead of a generic "cannot represent selector" error.
- Importing `key_zero` is unchanged: an exact `count = 0` match next to `countPlural`, which the SDK and editors treat as the same exact-number + plural choice.
