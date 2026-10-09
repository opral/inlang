---
"@inlang/plugin-message-format": patch
---

Import and export exact numbers (ICU `=0`) next to a plural.

- Un-annotated local declarations such as `local countPluralExact = count` import instead of crashing the parser. This is the shape `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}` and editors create when a user adds an exact number. Quoted literal locals (`local greeting = "hello"`) round-trip too, with `"` and `\` escaped.
- Selectors are still exported alphabetically, so files don't change when the plugin is upgraded, with one exception: an exact-number selector (an un-annotated local of the same input, or the input itself) is written directly before its plural, also with several plurals on one input (`countPluralExact`, `countPlural`, `countPlural1Exact`, `countPlural1`). Selector order is the MessageFormat 2 preference order, and the exact number has to come first to win over a category that also selects the number (French "one" selects 0). Files change only where the old output was wrong: earlier versions wrote such a message with the plural first, e.g. `"selectors": ["countPlural", "countPluralExact"]`, now `"selectors": ["countPluralExact", "countPlural"]`. With the default names (`countPluralExact`), earlier versions couldn't even read that output back, because `local countPluralExact = count` crashed their parser.
