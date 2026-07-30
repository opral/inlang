---
"@inlang/cli": minor
---

Address review feedback on the free translation fallback for `machine translate`.

- Renamed the fallback's identifiers so they no longer read as inlang-owned: select it with `INLANG_MACHINE_TRANSLATE_PROVIDER=demosjarco` (was `inlang`), and pin a model or opt in to Zero Data Retention with `DEMOSJARCO_TRANSLATE_MODEL` / `DEMOSJARCO_TRANSLATE_ZDR` (was `INLANG_FREE_TRANSLATE_MODEL` / `INLANG_FREE_TRANSLATE_ZDR`). Docs and runtime messages now consistently refer to it as the community-operated service at translate.demosjarco.dev.
- A complete outage of the fallback service now fails `machine translate` with a non-zero exit code instead of logging success. Partial, per-bundle translation failures keep the existing warn-and-continue behavior.
- The fallback now also treats request timeouts, HTTP 429 throttling, and malformed responses as a service outage (previously only network errors and 5xx responses were detected), each pointing you at configuring Google or DeepL instead.
