---
"@inlang/plugin-message-format": minor
---

Keep functions on placeholders. Export used to drop the function of every placeholder, so ICU `{count, plural, offset:1 other {You and # others}}` imported by `@inlang/plugin-icu1` and exported to this format became `You and {count} others`, which displays `count` instead of `count - 1`, and `{n, number, percent}` lost its style.

Placeholders with a function are now written with the syntax of local declarations, `{count: icu:pound offset=1}` or `{n: number style=percent}`, and imported back. Option values are literals (`style=percent`), quoted literals (`skeleton=|yyyy MMM d|`) or variables (`currency=$priceCurrency`). Placeholders without a function and files that have none are written exactly as before.
