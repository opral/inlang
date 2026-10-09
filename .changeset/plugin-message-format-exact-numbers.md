---
"@inlang/plugin-message-format": patch
---

Import and export exact numbers (ICU `=0`) next to a plural.

- Un-annotated local declarations such as `local countPluralExact = count` import instead of crashing the parser. This is the shape `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}` and editors create when a user adds an exact number. Quoted literal locals (`local greeting = "hello"`) round-trip too, with `"` and `\` escaped.
- Selectors are exported in message order instead of alphabetically. Selector order is the MessageFormat 2 preference order: an exact number has to stay before its plural to win over a category that also selects the number (French "one" selects 0). Files that earlier versions wrote with the plural first are repaired on import and export.
