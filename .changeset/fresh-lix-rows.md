---
"@inlang/sdk": patch
---

Upgrade to Lix SDK 0.15.0 and migrate query results to plain JavaScript rows. Preserve transaction-local message and variant lookups, including CTE reads. Safely encode locales containing NUL characters or the reserved identity prefix during writes and snapshot restoration.
