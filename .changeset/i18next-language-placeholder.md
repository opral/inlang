---
"@inlang/plugin-i18next": minor
---

Support the `{language}` placeholder in `pathPattern`. It resolves to the primary language subtag of a locale, e.g. `en` for `en-US`, so that files can be organized by base language. The existing `{locale}` and legacy `{languageTag}` placeholders keep working. Note that locales sharing a primary language, like `en-US` and `en-GB`, resolve to the same file with `{language}`; use `{locale}` when separate regional files are needed.
