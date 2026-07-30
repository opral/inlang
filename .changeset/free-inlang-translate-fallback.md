---
"@inlang/cli": minor
---

Add a free, third-party translation service as the default fallback for `machine translate`.

When `INLANG_MACHINE_TRANSLATE_PROVIDER` is unset and neither `INLANG_GOOGLE_TRANSLATE_API_KEY` nor `INLANG_DEEPL_API_KEY` is set, the CLI now falls back to a free translation service at translate.demosjarco.dev instead of failing. This service is community-run and is not owned, operated, or maintained by inlang. The CLI prints a notice to that effect, noting that stability is not guaranteed and that you should provide your own API key for higher reliability and control. Select it explicitly with `INLANG_MACHINE_TRANSLATE_PROVIDER=inlang`, and optionally pin a model with `INLANG_FREE_TRANSLATE_MODEL`. If the service is unreachable, the CLI explains how to configure your own provider instead.

See the updated BYOK guide for details.
