---
"@inlang/plugin-i18next": minor
---

Export exact numbers created by `@inlang/plugin-icu1` and editors, and import `_zero` as one form.

- An exact `0` on an un-annotated alias of `count` (`.local countPluralExact = {$count}`, ICU `{count, plural, =0 {…}}`) exports as `key_zero`, like an exact `0` on `count` itself. i18next looks up `_zero` whenever `count === 0`, in every language. Where the plural category `zero` covers more than 0 (Latvian: 10, 11–19, 20, …), i18next uses `_zero` for those counts too. An exact 0 can then only be exported next to a `zero` form with the same text; otherwise export fails with an error, because the "=0" text would also show for 10, 11, 20, ….
- Exact numbers i18next cannot express (`=1`, `=5`, exact numbers of ordinal plurals) fail the export with an error naming the bundle and number instead of a generic "cannot represent selector" error.
- **Import produces a different model:** `key_zero` imports as a single exact `count = 0` form next to `countPlural`, which the SDK and editors treat as the same exact-number + plural choice. The second `countPlural = zero` form with the same text is only imported where that category covers other numbers (Latvian), so editing `_zero` can no longer leave a diverging copy that export silently drops.
- **Export now fails where it used to succeed silently:** if two forms map to the same key with different texts, the export fails with an error naming the key, bundle and locale instead of keeping one. Projects that stored `_zero` imports from earlier versions and edited only one of the two `zero` forms get this error until both forms have the same text (or the extra `countPlural = zero` form is removed in languages without such a category).
- Locales written with underscores (`pt_BR`) resolve their plural rules.
