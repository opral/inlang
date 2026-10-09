---
"@inlang/plugin-icu1": patch
---

Fix two export issues around `#` and escaping.

- A `#` without an offset that the export moved into a nested plural with an `offset` on the same argument, as in `{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}`, exported as a bare `#` there and displayed `n - 1`. It now exports as `{n, number}`.
- Special characters that are adjacent or separated only by apostrophes are quoted as one segment (`'##'`, `'{}'`, `'#''#'` for `#'#`, `'{''}'` for `{'}`) instead of one by one. ICU reads `'#'` + `''` + `'#'` as one quoted segment in which `''` is one apostrophe, so quoting them one by one read back with an extra apostrophe, which grew on every export. Function styles are escaped the same way.
