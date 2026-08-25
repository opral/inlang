---
"@inlang/plugin-message-format": patch
---

Fix message-format round trips by trimming whitespace around every selector match, preserving placeholder inputs that follow existing declarations, and exporting without mutating declaration or variant-match order.
