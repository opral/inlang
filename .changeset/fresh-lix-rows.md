---
"@inlang/sdk": patch
---

Upgrade to Lix SDK 0.15.1 and migrate query results to plain JavaScript rows. Use the engine fix for transaction-local message and variant lookups, including CTE reads, without rewriting their SQL predicates. Safely encode locales containing NUL characters or the reserved identity prefix during writes and snapshot restoration.
