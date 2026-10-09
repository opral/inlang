---
"@inlang/cli": patch
---

`inlang machine translate` puts the variants it translates into an existing message at their place in the source message. It appended them, so with `en` = `one`, `*` and `de` = `*`, `de` became `*`, `one`, and runtimes that select the first matching variant (Paraglide JS) never selected `one`. The target message's variants are now ordered like the source: translated variants go to their source position, existing variants keep their text, and a variant the source doesn't have (e.g. a plural category of the target language) stays after the one it followed. Because variants are ordered by id, the variants from the first one that moves on get new ids. Messages that weren't translated, and their entries in the translation files, don't change.
