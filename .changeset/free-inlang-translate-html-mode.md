---
"@inlang/cli": patch
---

Use `format=html` when translating through the free hosted translation service (translate.demosjarco.dev), now that it supports it. Message patterns are serialized with placeholders wrapped in `<span class="notranslate">`, matching the same convention the Google and DeepL providers already rely on to keep placeholder markup untouched during translation.
