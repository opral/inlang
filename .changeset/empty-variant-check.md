---
"@inlang/sdk": minor
---

Add the `empty-variant` check: a variant (form) whose pattern is empty while another variant of the message has text, e.g. an ICU `=0 {}`, is reported with its `variantId` and `matches`, the reference locale's included. `checkTranslation()` reports it as `{ type: "empty-variant" }`.
