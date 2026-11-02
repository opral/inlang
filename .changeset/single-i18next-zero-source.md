---
"@inlang/plugin-i18next": patch
---

Import each `_zero` resource entry as one editable variant, so changing or deleting it cannot leave a hidden duplicate that restores the old translation. Use a zero-category match where the locale selects that category at count 0, preserving i18next runtime behavior for cardinal, ordinal, and context fallbacks. Existing resource text continues to preserve key order, and exporting previously authored exact-number variants remains supported.
