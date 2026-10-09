---
"@inlang/plugin-icu1": patch
---

Fix `#` next to selects in plurals, and plurals and selects that repeat an argument.

- ICU and `intl-messageformat` read `#` in a select nested in a plural as a literal "#". The export wrote a `#` there whenever it moved a select into a plural, e.g. for `{count, plural, one {# item} other {# items}} {gender, select, female {for her} other {}}`, which then displayed "# item for her". A `#` now stays directly in its plural, or exports as the number it displays (`{count, number}`, or `{count, plural, offset:1 other {#}}` with an offset), which also imports back as that `#`. A literal "#" in such a select moves out of the plural with its select where possible, since `'#'` there is no quote for ICU.
- Plurals on the same argument, type and offset shared one selector, which merged their cases: `{count, plural, one {# file} other {# files}} {count, plural, one {was} other {were}}` displayed "0 files was". A plural nested in or following such a plural now gets its own selector, and sibling plurals export as siblings again. Selects on the same argument merge into one select with the cases each value selects.
- A selector now follows the selectors it is nested in, also when it occurs first elsewhere in the message.
- An exact match (`=1`) of a plural no longer pairs with another plural on the same argument with a different offset.
- Adjacent texts are escaped together, so `#'#` followed by `#` no longer exports as `'#''#''#'`.
