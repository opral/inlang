---
"@inlang/plugin-icu1": minor
---

Keep the plural `offset` on `#`. In `{count, plural, offset:1 … other {You and # others}}`, `#` displays `count - offset`, but it imported as `{$count :icu:pound}` without the offset, so consumers could not format it without finding the enclosing plural. It now imports as `{$count :icu:pound offset=1}`. A `#` inside a nested plural gets the offset of the innermost plural, and a plural without an offset (or `offset:0`) imports as before. Export still writes `#` inside its plural and takes the offset from the plural, so messages round-trip unchanged. A `#` that no longer sits in its plural, for example after an editor removed or changed the plural, exports as what it displays: `{count, number}`, or `{count, plural, offset:1 other {#}}` when it has an offset. A literal `#` in a select nested in a plural is now escaped on export instead of turning into a `#` placeholder.

This is a minor release because the imported inlang message shape changes for `#` in plurals with an offset.
