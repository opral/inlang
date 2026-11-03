---
"@inlang/cli": minor
"@inlang/sdk": minor
---

Add a `translationDescriptors` project setting that points to a YAML file with per-message descriptions for machine translation. The SDK accepts exact bundle IDs or i18n-ally `reviews` keys (converting the first `.` in `<namespace>.<key>` to `:`). OpenAI and DeepL use the descriptions as context; unsupported providers warn and continue without them.
