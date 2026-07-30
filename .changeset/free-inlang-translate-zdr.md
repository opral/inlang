---
"@inlang/cli": minor
---

Add an optional `INLANG_FREE_TRANSLATE_ZDR` environment variable for the free, third-party translation service.

When set to `true`, the CLI passes a `zdr=true` query parameter to the free service so the request is processed with Zero Data Retention. This is scoped to the free service only and has no effect on the Google or DeepL providers. When unset, no ZDR parameter is sent and the service's default behavior applies.
