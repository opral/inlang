---
"@inlang/sdk": patch
"@inlang/cli": patch
---

New messages, variants and bundles get uuid v7 ids instead of random uuid v4 ids, so they keep the order they were created in. Messages and variants are ordered by id (`selectBundleNested`, exports), and the database already creates uuid v7 ids, but `insertBundleNested` / `upsertBundleNested` (used by editors), the deprecated `createMessage` / `createVariant` helpers and `inlang machine translate` created v4 ids: variants a person added in an editor, or the variants of a machine-translated message, came out in random order. Runtimes like Paraglide JS select the first matching variant, so the order is part of the message. Existing ids don't change.
