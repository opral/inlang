---
"@inlang/sdk": patch
---

Reject a directory save if a declared translation resource changes while its plugin exports. Files edited, deleted, or created during export keep their external content instead of being overwritten, including otherwise unchanged verbatim exports.
