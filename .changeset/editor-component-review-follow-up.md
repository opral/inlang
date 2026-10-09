---
"@inlang/editor-component": patch
---

Review follow-up:

- `<inlang-pattern-editor>`: a `variant` with another `id` ("+ Add form") replaces the content and forgets pending echoes, so unsaved text of the previous variant is never saved into the new one. Echoes are compared structurally, so a store that returns patterns with sorted keys (the SDK database) no longer reverts text typed after a token was inserted. A lone `markup-start` is kept, and keys are left to an IME while it composes. Undo stays with the host (documented).
- `addExactNumber` / `removeExactNumber` find the exact-number selector in any language (no more `countPluralExact1` when only some locales use `=0`). `removeSelector` on a plural removes its exact-number partner. `addSelector` throws for an input that already is a plural and `selectableVariables` no longer offers it; select values get their forms before the catch-all.
- `selectVariant` and `<inlang-message-forms>` respect an ICU `offset`; `pluralExamples` takes `offset` and returns copies. `<inlang-message-forms>` shows a plural's explicit `other` once.
- The `@inlang/sdk` peer dependency is published as a caret range.
