---
"@inlang/plugin-apple-strings": minor
---

Support the `{language}` placeholder in `pathPattern`. It resolves to the primary language subtag of a locale, e.g. `en` for `en-US`, so that `.lproj` files can be organized by base language. The existing `{locale}` placeholder keeps working.
