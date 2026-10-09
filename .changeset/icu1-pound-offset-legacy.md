---
"@inlang/plugin-icu1": patch
---

Export `#` with the offset it displays wherever the export moves it.

- A `#` without an `offset` option is offset 0 whenever the message has a plural without an offset on its argument, not only when such a plural encloses it. A select under a plural with an offset can move an offset-0 `#` out of its own plural: in `{count, plural, offset:1 other {{gender, select, male {{count, plural, other {# x}}} other {{count, plural, other {# y}}}}}}`, count 2 displayed "1 x". It now displays "2 x".
- A `#` imported before 1.2.0 has no `offset` option even in a plural with an offset. When all plurals of the message on its argument have an offset, it takes the offset of the plural it sits in, or, outside of one (moved out by a select, in a plural on another argument, or after an editor removed its plural), the offset of the plural on its argument, instead of exporting as `{count, number}`. Plurals of other locales of the bundle no longer affect this.
