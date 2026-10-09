---
"@inlang/plugin-i18next": patch
---

Export ICU `#` (imported by `@inlang/plugin-icu1` as `icu:pound`) that no longer sits in a plural, for example after an editor removed the plural.

- `#` without a plural offset exports as `{{count, number}}`, which i18next formats like ICU formats `#`. It used to export as `{{count, icu:pound}}`, an unknown i18next format.
- `#` with a plural offset displays `count - offset`, which i18next cannot express. The export fails with an error naming the bundle, locale and offset instead of "Not implemented".
- Other functions with options fail the export with an error naming the options, function, variable, bundle and locale instead of "Not implemented".
