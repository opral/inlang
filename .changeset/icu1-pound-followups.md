---
"@inlang/plugin-icu1": patch
---

Fix two export issues around `#` and escaping.

- A `#` without an offset that the export moved into a nested plural with an `offset` on the same argument, as in `{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}`, exported as a bare `#` there and displayed `n - 1`. It now exports as `{n, number}`.
- Adjacent special characters are quoted together (`'##'`, `'{}'`) instead of one by one (`'#''#'`, `'{''}'`). Quoting them one by one read back with an extra apostrophe, which grew on every export.
