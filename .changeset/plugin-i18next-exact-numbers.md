---
"@inlang/plugin-i18next": minor
---

Export exact numbers created by `@inlang/plugin-icu1` and editors, and keep `_zero` files unchanged.

- An exact `0` on an un-annotated alias of `count` (`.local countPluralExact = {$count}`, ICU `{count, plural, =0 {…}}`) exports as `key_zero`, like an exact `0` on `count` itself. i18next looks up `_zero` whenever `count === 0`, in every language. Where the plural category `zero` covers more than 0 (Latvian: 10, 11–19, 20, …), i18next uses `_zero` for those counts too. An exact 0 can then only be exported next to a `zero` form with the same text; otherwise export fails with an error, because the "=0" text would also show for 10, 11, 20, ….
- Exact numbers i18next cannot express (`=1`, `=5`, exact numbers of ordinal plurals) fail the export with an error naming the bundle and number instead of a generic "cannot represent selector" error.
- Two forms that map to the same key with different texts fail the export with an error naming the key, bundle and locale, instead of keeping one, except `_zero` where the `zero` category selects no number other than 0 (see below). Files change only where the old output was wrong. `_zero` imports as before, as an exact `count = 0` form plus a `countPlural = zero` form, and keeps its position in the file. Where the `zero` category selects no number other than 0 (English, French, Arabic, Welsh, and tags Intl has no plural rules for), i18next shows the exact text for `_zero`. The export writes it, as earlier versions did, also if only the "=0" form was edited. In Latvian, where `zero` also selects 10, 11–19, 20, …, earlier versions wrote the "=0" text for all of those counts. Example: an "=0" form "Nav preču" and a `zero` form "{{count}} preču" made `item_zero` "Nav preču" also for 10 items. That now fails until both forms have the same text.
- Locales written with underscores (`pt_BR`) resolve their plural rules.
