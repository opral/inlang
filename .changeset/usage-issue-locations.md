---
"@inlang/sdk": minor
"@inlang/plugin-m-function-matcher": patch
---

Usage analysis issues can locate the construct that makes the analysis incomplete. `UsageIssue` has optional `start` and `end` positions (1-based lines, 0-based columns, as for references), which `checkProject` and `findUsages` pass through. The m-function matcher reports one issue per unresolved construct, in source order, e.g. `src/Field.tsx` line 14 for ``m[`${fieldName}_label`]()``, instead of one issue per reason and file.
