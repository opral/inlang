---
"@inlang/plugin-message-format": patch
---

Import and export exact numbers (ICU `=0`) next to a plural.

- Un-annotated local declarations such as `local countPluralExact = count` import instead of crashing the parser. This is the shape `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}` and editors create when a user adds an exact number. Quoted literal locals (`local greeting = "hello"`) round-trip too, with `"` and `\` escaped.
- Selectors are still exported alphabetically, so files don't change when the plugin is upgraded, with one exception: an exact-number selector is written directly before its plural. Selector order is the MessageFormat 2 preference order, and the exact number has to come first to win over a category that also selects the number (French "one" selects 0). Files change only where the old output was wrong: earlier versions wrote such a message with the plural first, which the earlier versions couldn't even read back (`local countPluralExact = count` crashed the parser), e.g. `"selectors": ["countPlural", "countPluralExact"]` is now written as `"selectors": ["countPluralExact", "countPlural"]`.
