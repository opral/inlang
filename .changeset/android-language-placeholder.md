---
"@inlang/plugin-android": minor
---

Support the `{language}` placeholder in `pathPattern`. It expands to the Android resource qualifier of the primary language subtag of the locale, e.g. `-de` for `de-DE` and `-zh` for `zh-Hant-TW`, so that resource directories can be organized by base language. Like `{locale}`, the base locale uses no qualifier, because Android requires default resources in the directory without one.
